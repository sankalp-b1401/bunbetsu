# Planning Better Waste Management for College Festivals

> **Description:** Bunbetsu helps college event organizers predict festival waste and decide where bins should be placed before the event begins.

## The Problem

College festivals bring a lot of people together in a small space. Food stalls, concerts, sports events, workshops, and exhibitions all create waste, but not in the same way or in the same amount.

The problem is that waste planning usually happens during the event. Organizers may not know how much waste will be generated, how many bins are needed, or where the bins should be placed. A bin placed too far from a busy area may be ignored, while another area may have more bins than it needs. This can lead to overflowing bins, poor waste separation, and extra collection work.

There is also very little festival-specific data available to train a prediction model. We could not wait for a perfect dataset to be created before building a solution. This was the problem we wanted to address for the AWS Build Bharat Hackathon under the Waste and Energy theme.

## Our Solution

We built Bunbetsu, a campus event waste-planning application.

The organizer first selects a college campus and adds the event details, such as the number of days, expected footfall, activity zones, and entry gate. Bunbetsu then estimates the total waste and divides it into categories such as Food, Plastic, Paper, Glass, and Others.

The application also recommends how many bins are needed in each event area and shows their suggested locations on the campus map. It separates recyclable and disposable waste, checks the available space around each area, and estimates how often bins may need to be emptied.

To understand movement around the campus, Bunbetsu uses OpenStreetMap data. It finds walkable paths, connects the event areas to those paths, and scores the routes between important locations. Instead of looking only at one shortest route, it also considers other nearby routes. More popular paths can then receive more attention when roadside bins are planned.

Because a complete festival dataset was not available, we started with a mathematical model based on CPCB waste-generation data, activity weights, and waste-composition assumptions. The model gives low, central, and high estimates so that organizers can plan with some uncertainty in mind.

Bunbetsu does not just predict waste. It connects the prediction to the actual campus layout and helps organizers decide where waste infrastructure should be placed before the festival begins.
