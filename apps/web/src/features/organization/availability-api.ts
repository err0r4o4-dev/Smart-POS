import { organizationRequest } from '../../lib/organization-api';

export type RestaurantAvailability = {
  timezone: string;
  weekly_windows: { weekday: number; start: string; end: string }[];
  global_pause: boolean;
  dine_in_paused: boolean;
  takeaway_paused: boolean;
  pickup_paused: boolean;
  delivery_paused: boolean;
  revision: number;
};

function availabilityPath(organizationID: string) {
  return `/organizations/${encodeURIComponent(organizationID)}/restaurant/availability`;
}

export function getRestaurantAvailability(
  organizationID: string,
  signal?: AbortSignal,
) {
  return organizationRequest<RestaurantAvailability>(
    availabilityPath(organizationID),
    { signal },
  );
}

export function saveRestaurantAvailability(
  organizationID: string,
  body: RestaurantAvailability,
  csrf: string,
) {
  return organizationRequest<RestaurantAvailability>(
    availabilityPath(organizationID),
    { method: 'PUT', body, csrf },
  );
}
