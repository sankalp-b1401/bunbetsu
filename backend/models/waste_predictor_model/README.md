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
W = F × D × R × I

F: expected daily fest footfall
D: number of fest days (total attendee-days = F × D)
R: baseline kg/person/day rate resolved automatically from the CPCB (2020-21) state/UT dataset
I: weighted activity-intensity factor

## Baseline rate resolution
The waste prediction baseline is automatically selected from the state/UT of the chosen campus using Central Pollution Control Board (CPCB) 2020-21 municipal solid-waste data (`cpcb_statewise_rates.py`).
If a state is unrecognized or has no reported rate (such as Ladakh), the India national average fallback of 0.11907 kg/person/day is applied and flagged in the response metadata.

`campus_state` is provided as an input string; client-supplied baseline rates are rejected.

## No calibration
This code does not fit or alter coefficients based on the validation dataset.
Validation and calibration are separate concerns.

## Tests
Run:
    pytest -q
