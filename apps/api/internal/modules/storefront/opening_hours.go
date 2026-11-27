package storefront

import "regexp"

// OpeningHours is public profile information, not an order admission schedule.
// A pointer weekday distinguishes an omitted day from Sunday (0).
type OpeningHours struct {
	Opens         string `json:"opens"`
	Closes        string `json:"closes"`
	ClosedWeekday *int   `json:"closed_weekday"`
	Timezone      string `json:"timezone"`
}

var openingClock = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

func (hours *OpeningHours) valid() bool {
	return hours == nil || (openingClock.MatchString(hours.Opens) && openingClock.MatchString(hours.Closes) &&
		hours.Opens < hours.Closes && hours.Timezone == "Asia/Bangkok" &&
		hours.ClosedWeekday != nil && *hours.ClosedWeekday >= 0 && *hours.ClosedWeekday <= 6)
}
