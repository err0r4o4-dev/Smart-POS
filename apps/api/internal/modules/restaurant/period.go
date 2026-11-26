package restaurant

import (
	"strconv"
	"time"
	_ "time/tzdata"
)

type BusinessPeriod struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

func queuePeriod(now time.Time, settings Settings, previous *BusinessPeriod) (BusinessPeriod, error) {
	if previous != nil {
		if !previous.Start.Before(previous.End) || now.Before(previous.Start) {
			return BusinessPeriod{}, ErrConflict
		}
		if now.Before(previous.End) {
			return *previous, nil
		}
	}
	period, err := businessPeriod(now, settings)
	if err != nil {
		return BusinessPeriod{}, err
	}
	if previous != nil && period.Start.Before(previous.End) {
		period.Start = previous.End
	}
	return period, nil
}

func businessPeriod(now time.Time, settings Settings) (BusinessPeriod, error) {
	location, err := time.LoadLocation(settings.Timezone)
	if err != nil || !timePattern.MatchString(settings.ClosingTime) {
		return BusinessPeriod{}, ErrInput
	}
	hour, _ := strconv.Atoi(settings.ClosingTime[:2])
	minute, _ := strconv.Atoi(settings.ClosingTime[3:])
	local := now.In(location)
	cutoff := func(day time.Time) time.Time {
		return time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, location)
	}
	end := cutoff(local)
	if !local.Before(end) {
		return BusinessPeriod{Start: end, End: cutoff(local.AddDate(0, 0, 1))}, nil
	}
	return BusinessPeriod{Start: cutoff(local.AddDate(0, 0, -1)), End: end}, nil
}
