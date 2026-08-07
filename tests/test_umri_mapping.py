from server import UMRI_LIVE_PLANTS, UMRI_MCR, plant_mapping


def test_umri_mapping_contains_only_the_eight_live_collections_and_coordinates():
    umri = plant_mapping()["sites"]["Umri"]
    assert len(umri) == 8
    assert {plant["collection"] for plant in umri} == {
        value["collection"] for value in UMRI_LIVE_PLANTS.values()
    }
    assert all(plant["mcrLat"] == UMRI_MCR["lat"] for plant in umri)
    assert all(plant["mcrLon"] == UMRI_MCR["lon"] for plant in umri)
    assert next(plant for plant in umri if plant["plantName"] == "PV Sons")["lat"] == 19.105417
