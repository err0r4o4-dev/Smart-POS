package customers

import (
	"errors"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid customer input")
var ErrConflict = errors.New("customer revision or identifier conflict")
var ErrNotFound = errors.New("customer not found")
var UUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var codePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,39}$`)
var phonePattern = regexp.MustCompile(`^\+?[0-9]{6,20}$`)

type Input struct {
	Code             string `json:"code"`
	Name             string `json:"name"`
	Phone            string `json:"phone"`
	Email            string `json:"email"`
	Notes            string `json:"notes"`
	MarketingConsent bool   `json:"marketing_consent"`
	Status           string `json:"status"`
	Revision         int64  `json:"revision"`
}
type Customer struct {
	ID string `json:"id"`
	Input
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Groups    []Group   `json:"groups"`
}
type Group struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Revision    int64  `json:"revision"`
	MemberCount int    `json:"member_count"`
}
type Selection struct {
	ID     string `json:"id"`
	Code   string `json:"code"`
	Name   string `json:"name"`
	Status string `json:"status"`
}
type Filter struct {
	Search   string `json:"search"`
	Status   string `json:"status"`
	GroupID  string `json:"group_id"`
	BranchID string `json:"branch_id"`
	From     string `json:"from"`
	To       string `json:"to"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}
type Page struct {
	Items    any `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

func text(value string, maximum int) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > maximum {
		return false
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return false
		}
	}
	return true
}
func (input *Input) normalize() error {
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	input.Name = strings.TrimSpace(input.Name)
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Notes = strings.TrimSpace(input.Notes)
	input.Phone = strings.TrimSpace(input.Phone)
	if !text(input.Phone, 40) {
		return ErrInput
	}
	input.Phone = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(input.Phone)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !codePattern.MatchString(input.Code) || !text(input.Name, 200) || !text(input.Notes, 2000) || !text(input.Email, 254) || input.Phone != "" && !phonePattern.MatchString(input.Phone) || input.Status != "ACTIVE" && input.Status != "ARCHIVED" {
		return ErrInput
	}
	if input.Email != "" {
		address, err := mail.ParseAddress(input.Email)
		if err != nil || address.Address != input.Email || address.Name != "" {
			return ErrInput
		}
	}
	return nil
}
func (group *Group) normalize() error {
	group.Code = strings.ToUpper(strings.TrimSpace(group.Code))
	group.Name = strings.TrimSpace(group.Name)
	if group.Status == "" {
		group.Status = "ACTIVE"
	}
	if !codePattern.MatchString(group.Code) || group.Name == "" || !text(group.Name, 200) || group.Status != "ACTIVE" && group.Status != "ARCHIVED" {
		return ErrInput
	}
	return nil
}
func (item *Customer) mask() {
	if item.Phone != "" {
		item.Phone = "••••" + item.Phone[len(item.Phone)-4:]
	}
	if item.Email != "" {
		item.Email = "••••"
	}
	item.Notes = ""
	item.MarketingConsent = false
}
func (input *Filter) validate() error {
	if input.Page == 0 {
		input.Page = 1
	}
	if input.PageSize == 0 {
		input.PageSize = 25
	}
	if input.Page < 1 || input.Page > 10000 || input.PageSize < 1 || input.PageSize > 100 || !text(input.Search, 200) || input.Status != "" && input.Status != "ACTIVE" && input.Status != "ARCHIVED" {
		return ErrInput
	}
	for _, id := range []string{input.GroupID, input.BranchID} {
		if id != "" && !UUID.MatchString(id) {
			return ErrInput
		}
	}
	for _, date := range []string{input.From, input.To} {
		if date != "" {
			if _, err := time.Parse(time.RFC3339, date); err != nil {
				return ErrInput
			}
		}
	}
	if input.From != "" && input.To != "" {
		from, _ := time.Parse(time.RFC3339, input.From)
		to, _ := time.Parse(time.RFC3339, input.To)
		if from.After(to) || to.Sub(from) > 366*24*time.Hour {
			return ErrInput
		}
	}
	return nil
}
func filter(values url.Values) (Filter, error) {
	input := Filter{Search: values.Get("search"), Status: values.Get("status"), GroupID: values.Get("group_id"), BranchID: values.Get("branch_id"), From: values.Get("from"), To: values.Get("to"), Page: 1, PageSize: 25}
	for key, target := range map[string]*int{"page": &input.Page, "page_size": &input.PageSize} {
		if value := values.Get(key); value != "" {
			number, err := strconv.Atoi(value)
			if err != nil || number < 1 {
				return input, ErrInput
			}
			*target = number
		}
	}
	return input, input.validate()
}
