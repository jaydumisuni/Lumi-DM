from pathlib import Path

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from core.v5 import firmware, samsung_fus


def test_samsung_provider_is_native_resolver_not_embedded_external_helper():
    provider = next(item for item in firmware.providers() if item["id"] == "samsung-fus")
    assert provider["brands"] == ["Samsung"]
    assert provider["direct_files"] is False
    assert "native fus adapter" in provider["description"].lower()
    assert "samloader" not in provider["description"].lower()
    source = Path(samsung_fus.__file__).read_text(encoding="utf-8")
    assert "Cryptodome" not in source and "SAMLOADER_" not in source


def test_samsung_model_and_csc_validation_is_strict():
    assert samsung_fus.normalize_model("sm-s921b") == "SM-S921B"
    assert samsung_fus.normalize_csc("eux") == "EUX"
    for bad in ("S921B", "SM-S921B/../../x", ""):
        try: samsung_fus.normalize_model(bad)
        except ValueError: pass
        else: raise AssertionError(bad)
    for bad in ("EU", "EUXX", "../", ""):
        try: samsung_fus.normalize_csc(bad)
        except ValueError: pass
        else: raise AssertionError(bad)


def test_binary_inform_binds_package_session_and_decrypt_key_without_exposing_key_as_header():
    class Client:
        def cloud_authorization(self): return "FUS nonce=SESSION"
    xml = """<FUSMsg><FUSBody><Results><Status>200</Status><LATEST_FW_VERSION><Data>S921BXXU9ABCDE/S921BOXM9ABCDE/S921BXXU9ABCDE/S921BXXU9ABCDE</Data></LATEST_FW_VERSION></Results><Put><BINARY_NAME><Data>SM-S921B_TEST.zip.enc4</Data></BINARY_NAME><BINARY_BYTE_SIZE><Data>4096</Data></BINARY_BYTE_SIZE><MODEL_PATH><Data>/SM-S921B/EUX/</Data></MODEL_PATH><LOGIC_VALUE_FACTORY><Data>0123456789abcdef</Data></LOGIC_VALUE_FACTORY></Put></FUSBody></FUSMsg>"""
    resolved = samsung_fus._parse_binary_inform(xml, model="SM-S921B", csc="EUX", version="S921BXXU9ABCDE/S921BOXM9ABCDE/S921BXXU9ABCDE/S921BXXU9ABCDE", client=Client())
    assert resolved.filename.endswith(".enc4") and resolved.size == 4096
    assert len(resolved.decrypt_key_hex) == 32
    envelope = resolved.request_envelope()
    assert envelope["provider_id"] == "samsung-fus"
    assert envelope["headers"]["Authorization"] == "FUS nonce=SESSION"
    assert envelope["provider_secret"]["samsung_decrypt_key"] == resolved.decrypt_key_hex
    assert "samsung_decrypt_key" not in envelope["headers"]


def test_native_samsung_decrypt_round_trip(tmp_path):
    key = bytes.fromhex("00112233445566778899aabbccddeeff")
    clear = b"PK\x03\x04Lumi Samsung firmware payload" * 17
    padder = padding.PKCS7(128).padder()
    padded = padder.update(clear) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.ECB()).encryptor()
    encrypted = encryptor.update(padded) + encryptor.finalize()
    source = tmp_path / "firmware.zip.enc4"
    source.write_bytes(encrypted)
    output = samsung_fus.decrypt_package(source, decrypt_key_hex=key.hex(), encryption=4)
    assert output.name == "firmware.zip"
    assert output.read_bytes() == clear
