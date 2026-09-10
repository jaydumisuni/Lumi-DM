from pathlib import Path
from core.v2.models import RequestEnvelope
from core.v2.vault import secure_request_envelope, hydrate_provider_secret, delete_secret

def test_provider_secret_is_vaulted_and_redacted(tmp_path):
    secured=secure_request_envelope(tmp_path,{"url":"https://example.test/file","provider_secret":{"decrypt_key":"TOPSECRET"}})
    assert "provider_secret" not in secured
    assert secured["provider_secret_reference"].startswith("lumi-vault:v1:")
    env=RequestEnvelope.from_dict(secured)
    public=env.redacted_dict()
    assert public["provider_secret_reference"]=="<secure-reference>"
    assert "TOPSECRET" not in str(public)
    assert hydrate_provider_secret(env.provider_secret_reference)["decrypt_key"]=="TOPSECRET"


def test_provider_secret_can_be_destroyed_after_use(tmp_path):
    secured=secure_request_envelope(tmp_path,{"url":"https://example.test/file","provider_secret":{"decrypt_key":"TOPSECRET"}})
    reference=secured["provider_secret_reference"]
    assert delete_secret(reference) is True
    try:
        hydrate_provider_secret(reference)
    except Exception:
        pass
    else:
        raise AssertionError("destroyed provider secret remained readable")
