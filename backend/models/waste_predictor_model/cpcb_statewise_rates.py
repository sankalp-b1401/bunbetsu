"""
CPCB state/UT-wise municipal solid-waste generation baseline rates.

Source:
  Central Pollution Control Board (CPCB), Annual Report on Solid Waste
  Management (2020-21), Figure 5 / Annexure II.
  https://cpcb.nic.in/uploads/MSW/MSW_AnnualReport_2020-21.pdf

Units:
  kg of municipal solid waste per person per day.

Data notes:
- The source report's state/UT values are for reporting year 2020-21.
- Ladakh is not separately listed in the source table/figure; it is None,
  deliberately, rather than an invented estimate.
- Dadra & Nagar Haveli and Daman & Diu are combined in the source.
- Jammu & Kashmir is reported as one combined entry; the source does not
  provide a separate Ladakh rate.
- These are municipal solid-waste rates, not college-fest-specific rates.
"""

CPCB_STATEWISE_RATES_KG_PER_PERSON_DAY: dict[str, float | None] = {
    # States
    "Andhra Pradesh": 0.12547,
    "Arunachal Pradesh": 0.17137,
    "Assam": 0.03506,
    "Bihar": 0.03911,
    "Chhattisgarh": 0.06032,
    "Goa": 0.10199,
    "Gujarat": 0.15830,
    "Haryana": 0.18218,
    "Himachal Pradesh": 0.04699,
    "Jharkhand": 0.06241,
    "Karnataka": 0.17083,
    "Kerala": 0.09686,
    "Madhya Pradesh": 0.09645,
    "Maharashtra": 0.17805,
    "Manipur": 0.10366,
    "Meghalaya": 0.03672,
    "Mizoram": 0.30954,
    "Nagaland": 0.13218,
    "Odisha": 0.04839,
    "Punjab": 0.14301,
    "Rajasthan": 0.08876,
    "Sikkim": 0.10588,
    "Tamil Nadu": 0.18933,
    "Telangana": 0.24239,
    "Tripura": 0.08305,
    "Uttar Pradesh": 0.06266,
    "Uttarakhand": 0.12965,
    "West Bengal": 0.14075,

    # Union territories
    "Andaman and Nicobar Islands": 0.14488,
    "Chandigarh": 0.23104,
    "Dadra and Nagar Haveli and Daman and Diu": 0.29021,
    "Delhi": 0.44875,
    "Jammu and Kashmir": 0.11258,
    "Ladakh": None,  # Not separately reported by CPCB in this source.
    "Lakshadweep": 0.40692,
    "Puducherry": 0.24937,
}

CPCB_STATEWISE_RATES_SOURCE_YEAR = "2020-21"
CPCB_NATIONAL_AVERAGE_KG_PER_PERSON_DAY = 0.11907
