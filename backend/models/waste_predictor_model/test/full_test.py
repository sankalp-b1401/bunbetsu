import pytest
from waste_predictor_model.waste_predictor_model import FestInput, LocationInput, predict

def test_complete_mock_response_structure():
    r=predict(FestInput(
        total_footfall=12000,duration_days=3,
        activities=("Food Stalls","Music Concert","Performing Arts","Literary & Fine Arts","Sports","Hackathon"),
        campus_state="Uttar Pradesh",
        locations=(
            LocationInput("Main Ground",("Food Stalls","Music Concert"),8000),
            LocationInput("Open Food Court",("Food Stalls","Music Concert"),4000),
            LocationInput("Auditorium",("Performing Arts","Literary & Fine Arts"),2500),
            LocationInput("Sports Complex",("Sports",),6000),
            LocationInput("Innovation Block",("Hackathon",),3000),
        )))
    assert r.campus_state == "Uttar Pradesh"
    assert r.baseline_rate_kg_per_person_day == pytest.approx(0.06266)
    assert r.baseline_source_year == "2020-21"
    assert r.baseline_is_national_fallback is False
    expected={"Food","Plastic","Paper","Glass","Others"}
    assert r.total_waste_kg.low<=r.total_waste_kg.central<=r.total_waste_kg.high
    assert set(r.composition_kg)==set(r.composition_percent)==expected
    assert sum(r.composition_percent.values())==pytest.approx(1)
    assert len(r.location_allocations)==5
    assert sum(x.normalized_share for x in r.location_allocations)==pytest.approx(1)
    assert sum(x.total_waste_kg.central for x in r.location_allocations)==pytest.approx(r.total_waste_kg.central)
    a=next(x for x in r.location_allocations if x.location_name=="Main Ground")
    b=next(x for x in r.location_allocations if x.location_name=="Open Food Court")
    assert a.normalized_share==pytest.approx(b.normalized_share)
    assert a.total_waste_kg.central==pytest.approx(b.total_waste_kg.central)
    h=r.heatmap_data
    assert h is not None
    assert set(h.total_waste_kg)=={x.location_name for x in r.location_allocations}
    assert set(h.category_waste_kg)==expected
    for cat in expected:
        assert set(h.category_waste_kg[cat])==set(h.total_waste_kg)
    for x in r.location_allocations:
        assert h.total_waste_kg[x.location_name]==x.total_waste_kg
        assert h.recyclable_kg[x.location_name]==x.recyclable_kg
        assert h.disposable_kg[x.location_name]==x.disposable_kg
        for cat in expected:
            assert h.category_waste_kg[cat][x.location_name]==x.composition_kg[cat]
    assert r.assumptions
