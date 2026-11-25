package restaurant

import "net/http"

func decodeAvailabilitySettings(request *http.Request) (AvailabilitySettings, error) {
	var input struct {
		Timezone       *string               `json:"timezone"`
		WeeklyWindows  *[]AvailabilityWindow `json:"weekly_windows"`
		GlobalPause    *bool                 `json:"global_pause"`
		DineInPaused   *bool                 `json:"dine_in_paused"`
		TakeawayPaused *bool                 `json:"takeaway_paused"`
		PickupPaused   *bool                 `json:"pickup_paused"`
		DeliveryPaused *bool                 `json:"delivery_paused"`
		Revision       *int64                `json:"revision"`
	}
	if err := decode(request, &input); err != nil {
		return AvailabilitySettings{}, err
	}
	if input.Timezone == nil || input.WeeklyWindows == nil || input.GlobalPause == nil ||
		input.DineInPaused == nil || input.TakeawayPaused == nil || input.PickupPaused == nil ||
		input.DeliveryPaused == nil || input.Revision == nil {
		return AvailabilitySettings{}, ErrInput
	}
	return AvailabilitySettings{
		Timezone: *input.Timezone, WeeklyWindows: *input.WeeklyWindows, GlobalPause: *input.GlobalPause,
		DineInPaused: *input.DineInPaused, TakeawayPaused: *input.TakeawayPaused, PickupPaused: *input.PickupPaused,
		DeliveryPaused: *input.DeliveryPaused, Revision: *input.Revision,
	}, nil
}
