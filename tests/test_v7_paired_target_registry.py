from pathlib import Path
from core.v2.store import StateStore
from core.v7.device_pairing import PairedTargetRegistry


def test_target_registry_vaults_token_and_public_listing_never_exposes_it(tmp_path):
    store=StateStore(tmp_path); reg=PairedTargetRegistry(store)
    reg.remember(device={"id":"lumi-pc","name":"PC","kind":"computer"},endpoint="http://192.168.1.20:7000",token="super-secret",role="owner")
    public=reg.list_public(); assert len(public)==1
    assert "token" not in str(public).lower() and "secret" not in str(public).lower()
    peer=reg._load()[0]; assert peer["token_reference"].startswith("lumi-vault:v1:")
    assert reg.token_for("lumi-pc")=="super-secret"
    reg.remove("lumi-pc"); assert reg.list_public()==[]
    store.close()
