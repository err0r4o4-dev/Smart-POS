package storefront

import (
	"errors"
	"math"
)

var errNativeDeliveryOutsideArea = errors.New("destination outside delivery area")

type nativeDeliveryPoint struct {
	latitude, longitude float64
}

func (p *nativeDeliveryPoint) valid() bool {
	return p != nil && p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180
}

// checkNativeDeliveryArea measures surface distance from the restaurant's confirmed
// location to the delivery point. The caller must supply the restaurant's own radius.
func checkNativeDeliveryArea(origin, destination *nativeDeliveryPoint, radiusMeters int64) error {
	if !origin.valid() || !destination.valid() || radiusMeters <= 0 {
		return ErrInput
	}
	const radians = math.Pi / 180
	const earthRadiusMeters = 6371008.8
	dLat := math.Sin((destination.latitude - origin.latitude) * radians / 2)
	dLon := math.Sin((destination.longitude - origin.longitude) * radians / 2)
	a := dLat*dLat + math.Cos(origin.latitude*radians)*math.Cos(destination.latitude*radians)*dLon*dLon
	distance := 2 * earthRadiusMeters * math.Asin(math.Sqrt(min(1, a)))
	if distance > float64(radiusMeters) {
		return errNativeDeliveryOutsideArea
	}
	return nil
}
