# Bunbetsu Mathematical Model v1

## Scope
College-fest solid-waste prediction only.

## Frozen conventions
- Footfall = total unique people over the entire fest.
- Duration = number of fest days.
- Six activities:
  Food Stalls, Music Concert, Dance & Theatre, Sports, Debate, Hackathon.
- Five output categories:
  Food, Plastic, Paper, Glass, Others.
- Recyclable = Plastic + Paper + Glass.
- Disposable = Food + Others.
- Activity weights are relative contribution weights; they are not attendance estimates.
- Spatial activity/location quantities are internal allocations for heatmaps.

## Implemented equation
W = F × R × I

F: total unique fest footfall
R: baseline kg/person rate supplied to the model
I: weighted activity-intensity factor

The implementation deliberately does NOT multiply F by duration.

## Important boundary
The currently accessible project artifacts contain an older draft specification that used
attendee-visits. That draft is not used here. This implementation follows the later
project decision that footfall means total unique people.

The model therefore requires `baseline_rate_kg_per_person` to be supplied with a
denominator compatible with that unique-footfall definition. It does not invent a
duration conversion.

## No calibration
This code does not fit or alter coefficients based on the validation dataset.
Validation and calibration are separate concerns.

## Tests
Run:
    pytest -q
