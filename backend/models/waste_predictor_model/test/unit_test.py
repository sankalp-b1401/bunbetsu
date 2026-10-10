import pytest
from waste_predictor_model.waste_predictor_model import (
    ACTIVITIES, ACTIVITY_INTENSITY, ACTIVITY_WEIGHTS, FestInput, LocationInput,
    predict, weighted_intensity, weighted_composition,
    get_baseline_rate_for_state,
)
from waste_predictor_model.cpcb_statewise_rates import (
    CPCB_STATEWISE_RATES_KG_PER_PERSON_DAY,
    CPCB_NATIONAL_AVERAGE_KG_PER_PERSON_DAY,
    CPCB_STATEWISE_RATES_SOURCE_YEAR,
)

TEST_STATE = "Uttar Pradesh"
BASE = 0.06266  # CPCB rate for Uttar Pradesh


def inp(**kw):
    d = dict(total_footfall=10000, duration_days=2, activities=("Food Stalls", "Performing Arts"), campus_state=TEST_STATE)
    d.update(kw)
    return FestInput(**d)


def test_activity_names():
    assert "Performing Arts" in ACTIVITIES and "Literary & Fine Arts" in ACTIVITIES
    assert "Dance & Theatre" not in ACTIVITIES and "Debate" not in ACTIVITIES


def test_core_formula():
    r = predict(inp(total_footfall=1000, duration_days=2, activities=("Food Stalls",)))
    i = ACTIVITY_INTENSITY["Food Stalls"]
    assert r.total_waste_kg.low == pytest.approx(1000 * 2 * BASE * i[0])
    assert r.total_waste_kg.central == pytest.approx(1000 * 2 * BASE * i[1])
    assert r.total_waste_kg.high == pytest.approx(1000 * 2 * BASE * i[2])


def test_duration_and_footfall_scale_linearly():
    assert predict(inp(duration_days=4)).total_waste_kg.central == pytest.approx(predict(inp(duration_days=1)).total_waste_kg.central * 4)
    assert predict(inp(total_footfall=20000)).total_waste_kg.central == pytest.approx(predict(inp(total_footfall=10000)).total_waste_kg.central * 2)


def test_weighted_functions():
    assert weighted_intensity(("Food Stalls", "Performing Arts")).central == pytest.approx((5 * 1.7 + 3 * 1.15) / (5 + 3))
    assert sum(weighted_composition(("Food Stalls", "Performing Arts")).as_dict().values()) == pytest.approx(1)


def test_composition_and_groups():
    r = predict(inp())
    assert sum(r.composition_percent.values()) == pytest.approx(1)
    for e in ("low", "central", "high"):
        assert sum(getattr(v, e) for v in r.composition_kg.values()) == pytest.approx(getattr(r.total_waste_kg, e))
    assert r.recyclable_kg.central == pytest.approx(sum(r.composition_kg[x].central for x in ("Plastic", "Paper", "Glass")))
    assert r.disposable_kg.central == pytest.approx(sum(r.composition_kg[x].central for x in ("Food", "Others")))


def test_validation():
    with pytest.raises(ValueError): predict(inp(total_footfall=0))
    with pytest.raises(ValueError): predict(inp(duration_days=0))
    with pytest.raises(ValueError): predict(inp(activities=("Nope",)))
    with pytest.raises(ValueError): predict(inp(campus_state=""))
    with pytest.raises(ValueError): predict(inp(campus_state="   "))
    assert ACTIVITY_WEIGHTS == {
        "Food Stalls": 5,
        "Music Concert": 4,
        "Performing Arts": 3,
        "Literary & Fine Arts": 2,
        "Sports": 1,
        "Hackathon": 1,
    }


def test_known_state_resolution():
    res = get_baseline_rate_for_state("Uttar Pradesh")
    assert res.rate_kg_per_person_day == pytest.approx(0.06266)
    assert res.matched_state == "Uttar Pradesh"
    assert res.is_national_fallback is False
    assert res.source_year == "2020-21"

    res_delhi = get_baseline_rate_for_state("Delhi")
    assert res_delhi.rate_kg_per_person_day == pytest.approx(0.44875)
    assert res_delhi.matched_state == "Delhi"


def test_state_lookup_case_whitespace_tolerant():
    res1 = get_baseline_rate_for_state("  uttar pradesh  ")
    assert res1.rate_kg_per_person_day == pytest.approx(0.06266)
    assert res1.matched_state == "Uttar Pradesh"

    res2 = get_baseline_rate_for_state("DELHI")
    assert res2.rate_kg_per_person_day == pytest.approx(0.44875)
    assert res2.matched_state == "Delhi"

    res3 = get_baseline_rate_for_state("  karnataka \t")
    assert res3.rate_kg_per_person_day == pytest.approx(0.17083)


def test_known_alias_resolves_to_canonical_state():
    res_orissa = get_baseline_rate_for_state("Orissa")
    assert res_orissa.matched_state == "Odisha"
    assert res_orissa.rate_kg_per_person_day == pytest.approx(0.04839)

    res_uttaranchal = get_baseline_rate_for_state("Uttaranchal")
    assert res_uttaranchal.matched_state == "Uttarakhand"
    assert res_uttaranchal.rate_kg_per_person_day == pytest.approx(0.12965)

    res_pondi = get_baseline_rate_for_state("Pondicherry")
    assert res_pondi.matched_state == "Puducherry"
    assert res_pondi.rate_kg_per_person_day == pytest.approx(0.24937)

    res_andaman = get_baseline_rate_for_state("Andaman & Nicobar Islands")
    assert res_andaman.matched_state == "Andaman and Nicobar Islands"
    assert res_andaman.rate_kg_per_person_day == pytest.approx(0.14488)

    res_dnh = get_baseline_rate_for_state("Dadra & Nagar Haveli and Daman & Diu")
    assert res_dnh.matched_state == "Dadra and Nagar Haveli and Daman and Diu"
    assert res_dnh.rate_kg_per_person_day == pytest.approx(0.29021)


def test_unknown_state_raises_error_and_fallback():
    # Clear error when fallback is disabled
    with pytest.raises(ValueError, match="Unknown state/UT"):
        get_baseline_rate_for_state("Atlantis", allow_fallback=False)

    # National-average fallback when allowed
    fallback_res = get_baseline_rate_for_state("Atlantis", allow_fallback=True)
    assert fallback_res.rate_kg_per_person_day == pytest.approx(0.11907)
    assert fallback_res.is_national_fallback is True
    assert fallback_res.source_year == "2020-21"


def test_empty_state_raises_clear_error():
    with pytest.raises(ValueError, match="cannot be empty"):
        get_baseline_rate_for_state("")
    with pytest.raises(ValueError, match="cannot be empty"):
        get_baseline_rate_for_state("   ")


def test_ladakh_none_entry_raises_error_without_fallback_and_uses_national_average():
    # Clear error without fallback
    with pytest.raises(ValueError, match="has no baseline rate reported"):
        get_baseline_rate_for_state("Ladakh", allow_fallback=False)

    # Uses national average fallback with fallback allowed
    res = get_baseline_rate_for_state("Ladakh", allow_fallback=True)
    assert res.rate_kg_per_person_day == pytest.approx(0.11907)
    assert res.matched_state == "Ladakh"
    assert res.is_national_fallback is True
    assert res.source_year == "2020-21"


def test_model_formula_uses_state_resolved_rate():
    # Uttar Pradesh rate: 0.06266
    up_res = predict(FestInput(total_footfall=5000, duration_days=2, activities=("Food Stalls",), campus_state="Uttar Pradesh"))
    up_rate = 0.06266
    i_food = ACTIVITY_INTENSITY["Food Stalls"]
    assert up_res.total_waste_kg.central == pytest.approx(5000 * 2 * up_rate * i_food[1])
    assert up_res.baseline_rate_kg_per_person_day == pytest.approx(up_rate)
    assert up_res.campus_state == "Uttar Pradesh"

    # Delhi rate: 0.44875
    delhi_res = predict(FestInput(total_footfall=5000, duration_days=2, activities=("Food Stalls",), campus_state="Delhi"))
    delhi_rate = 0.44875
    assert delhi_res.total_waste_kg.central == pytest.approx(5000 * 2 * delhi_rate * i_food[1])
    assert delhi_res.baseline_rate_kg_per_person_day == pytest.approx(delhi_rate)
    assert delhi_res.campus_state == "Delhi"

    assert delhi_res.total_waste_kg.central > up_res.total_waste_kg.central

def test_locations_conserve_total_and_identical_sets_split_equally():
    locs=(LocationInput("A",("Food Stalls","Performing Arts"),5000),LocationInput("B",("Food Stalls","Performing Arts"),1000),LocationInput("C",("Performing Arts",),2000))
    r=predict(inp(locations=locs))
    a,b,c=r.location_allocations
    assert a.normalized_share==pytest.approx(b.normalized_share)
    assert a.total_waste_kg.central==pytest.approx(b.total_waste_kg.central)
    assert sum(x.normalized_share for x in r.location_allocations)==pytest.approx(1)
    assert sum(x.total_waste_kg.central for x in r.location_allocations)==pytest.approx(r.total_waste_kg.central)
    assert a.area==5000 and b.area==1000

def test_area_does_not_change_share():
    r=predict(inp(activities=("Food Stalls",),locations=(LocationInput("A",("Food Stalls",),1),LocationInput("B",("Food Stalls",),10000))))
    assert r.location_allocations[0].normalized_share==pytest.approx(.5)
    assert r.location_allocations[1].normalized_share==pytest.approx(.5)

def test_heatmap_layers_and_values():
    r=predict(inp(locations=(LocationInput("A",("Food Stalls",),1000),)))
    h=r.heatmap_data
    assert h is not None
    assert set(h.category_waste_kg)=={"Food","Plastic","Paper","Glass","Others"}
    assert set(h.total_waste_kg)=={"A"}
    assert set(h.recyclable_kg)==set(h.disposable_kg)=={"A"}
    a=r.location_allocations[0]
    for cat in h.category_waste_kg:
        assert h.category_waste_kg[cat]["A"]==a.composition_kg[cat]

def test_no_locations_returns_no_spatial_output():
    r=predict(inp())
    assert r.location_allocations==()
    assert r.heatmap_data is None


def test_predefined_weights_drive_location_shares():
    locs = (
        LocationInput("Food", ("Food Stalls",), 1000),
        LocationInput("Music", ("Music Concert",), 1000),
        LocationInput("Arts", ("Performing Arts",), 1000),
        LocationInput("Literary", ("Literary & Fine Arts",), 1000),
        LocationInput("Sports", ("Sports",), 1000),
        LocationInput("Hackathon", ("Hackathon",), 1000),
    )
    r = predict(inp(locations=locs))

    shares = {x.location_name: x.normalized_share for x in r.location_allocations}
    assert shares["Food"] == pytest.approx(5 / 16)
    assert shares["Music"] == pytest.approx(4 / 16)
    assert shares["Arts"] == pytest.approx(3 / 16)
    assert shares["Literary"] == pytest.approx(2 / 16)
    assert shares["Sports"] == pytest.approx(1 / 16)
    assert shares["Hackathon"] == pytest.approx(1 / 16)
