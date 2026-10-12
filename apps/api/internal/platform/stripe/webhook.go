package stripe

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var eventIDPattern = regexp.MustCompile(`^evt_[A-Za-z0-9]{1,220}$`)

type CustomerEvent struct {
	ID       string `json:"id"`
	Object   string `json:"object"`
	Type     string `json:"type"`
	LiveMode *bool  `json:"livemode"`
	Created  int64  `json:"created"`
	Data     struct {
		Object CustomerSession `json:"object"`
	} `json:"data"`
}

func (client *CustomerClient) VerifyCustomerEvent(body []byte, signature string, now time.Time) (CustomerEvent, error) {
	if client == nil || client.webhookSecret == "" {
		return CustomerEvent{}, ErrUnavailable
	}
	if len(body) == 0 || len(body) > 256<<10 || len(signature) > 2048 {
		return CustomerEvent{}, ErrInput
	}
	var timestamp string
	var timestampSeen bool
	var signatures [][]byte
	for _, part := range strings.Split(signature, ",") {
		name, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			return CustomerEvent{}, ErrInput
		}
		if name == "t" {
			if timestampSeen {
				return CustomerEvent{}, ErrInput
			}
			timestampSeen = true
			timestamp = value
		} else if name == "v1" {
			decoded, err := hex.DecodeString(value)
			if err != nil || len(decoded) != sha256.Size {
				return CustomerEvent{}, ErrInput
			}
			signatures = append(signatures, decoded)
		}
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || seconds <= 0 || now.Sub(time.Unix(seconds, 0)) > 5*time.Minute || time.Unix(seconds, 0).Sub(now) > 5*time.Minute {
		return CustomerEvent{}, ErrInput
	}
	mac := hmac.New(sha256.New, []byte(client.webhookSecret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	expected := mac.Sum(nil)
	valid := false
	for _, candidate := range signatures {
		valid = hmac.Equal(expected, candidate) || valid
	}
	if !valid {
		return CustomerEvent{}, ErrInput
	}
	var envelope struct {
		CustomerEvent
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	if decoder.Decode(&envelope) != nil || decoder.Decode(new(any)) != io.EOF {
		return CustomerEvent{}, ErrInput
	}
	event := envelope.CustomerEvent
	if !eventIDPattern.MatchString(event.ID) || event.Object != "event" || event.Type == "" || event.LiveMode == nil || *event.LiveMode || event.Created <= 0 {
		return CustomerEvent{}, ErrInput
	}
	if event.Type != "checkout.session.completed" && event.Type != "checkout.session.expired" {
		return CustomerEvent{}, ErrNotFound
	}
	if json.Unmarshal(envelope.Data.Object, &event.Data.Object) != nil || event.Data.Object.Object != "checkout.session" || !sessionPattern.MatchString(event.Data.Object.ID) || event.Data.Object.LiveMode == nil || *event.Data.Object.LiveMode {
		return CustomerEvent{}, ErrInput
	}
	return event, nil
}
