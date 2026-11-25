package restaurant

import (
	"slices"
	"time"
)

type orderingMode string

const (
	modeDineIn   orderingMode = "DINE_IN"
	modeTakeaway orderingMode = "TAKEAWAY"
	modePickup   orderingMode = "PICKUP"
	modeDelivery orderingMode = "DELIVERY"
)

type orderingModes struct {
	dineIn, takeaway, pickup, delivery bool
}

func (m orderingModes) has(mode orderingMode) bool {
	switch mode {
	case modeDineIn:
		return m.dineIn
	case modeTakeaway:
		return m.takeaway
	case modePickup:
		return m.pickup
	case modeDelivery:
		return m.delivery
	default:
		return false
	}
}

type orderingWindow struct {
	weekday    int // ISO weekday: Monday = 1, Sunday = 7.
	start, end string
}

type minuteInterval struct {
	start, end int
}

type orderingSchedule struct {
	location *time.Location
	windows  [7][]minuteInterval
}

func newOrderingSchedule(timezone string, windows []orderingWindow) (orderingSchedule, error) {
	if timezone == "" || timezone == "Local" {
		return orderingSchedule{}, ErrInput
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return orderingSchedule{}, ErrInput
	}
	schedule := orderingSchedule{location: location}
	for _, w := range windows {
		if w.weekday < 1 || w.weekday > 7 || !timePattern.MatchString(w.start) ||
			(w.end != "24:00" && !timePattern.MatchString(w.end)) {
			return orderingSchedule{}, ErrInput
		}
		start, end := minuteOfDay(w.start), minuteOfDay(w.end)
		if start >= end {
			return orderingSchedule{}, ErrInput
		}
		day := w.weekday - 1
		schedule.windows[day] = append(schedule.windows[day], minuteInterval{start, end})
	}
	for _, day := range schedule.windows {
		slices.SortFunc(day, func(a, b minuteInterval) int { return a.start - b.start })
		for i := 1; i < len(day); i++ {
			if day[i].start < day[i-1].end {
				return orderingSchedule{}, ErrInput
			}
		}
	}
	return schedule, nil
}

// The caller has validated the five-byte HH:mm format.
func minuteOfDay(value string) int {
	hour := int(value[0]-'0')*10 + int(value[1]-'0')
	minute := int(value[3]-'0')*10 + int(value[4]-'0')
	return hour*60 + minute
}

func (s orderingSchedule) openAt(at time.Time) bool {
	if s.location == nil || at.IsZero() {
		return false
	}
	local := at.In(s.location)
	day := (int(local.Weekday()) + 6) % 7
	minute := local.Hour()*60 + local.Minute()
	for _, window := range s.windows[day] {
		if minute < window.start {
			break
		}
		if minute < window.end {
			return true
		}
	}
	return false
}

type admissionDenial string

const (
	admissionUnavailable  admissionDenial = "UNAVAILABLE"
	admissionPaused       admissionDenial = "PAUSED"
	admissionOutsideHours admissionDenial = "OUTSIDE_HOURS"
)

// admission evaluates a new order. Committed replays and existing orders use
// their own paths. The empty result means the mode can admit an order.
func (s orderingSchedule) admission(at time.Time, mode orderingMode, canSell bool, enabled orderingModes, globalPause bool, paused orderingModes) admissionDenial {
	switch {
	case !canSell || !enabled.has(mode):
		return admissionUnavailable
	case globalPause || paused.has(mode):
		return admissionPaused
	case !s.openAt(at):
		return admissionOutsideHours
	default:
		return ""
	}
}
