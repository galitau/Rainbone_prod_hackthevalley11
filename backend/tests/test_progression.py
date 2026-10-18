"""Progression uses deployed storage settings and serves stored frames without meshing dependencies."""
import builtins
import importlib
import unittest
from unittest import mock

from services import progression_mesh, storage


class ProgressionStorageTests(unittest.TestCase):
    def test_established_storage_configuration(self):
        env = {"VULTR_S3_ENDPOINT": "ewr1.vultrobjects.com", "VULTR_S3_ACCESS_KEY": "test-access",
               "VULTR_S3_SECRET_KEY": "test-secret", "VULTR_S3_BUCKET": "existing-bucket"}
        with mock.patch.object(storage, "runtime_env", return_value=env), mock.patch.object(storage.boto3, "client") as client:
            self.assertEqual(storage._settings(), ("existing-bucket", "therapy"))
            storage._client()
        client.assert_called_once_with("s3", endpoint_url="https://ewr1.vultrobjects.com",
                                       aws_access_key_id="test-access", aws_secret_access_key="test-secret",
                                       region_name="ewr1")

    def test_explicit_legacy_settings_override_aliases(self):
        env = {"VULTR_ENDPOINT_URL": "https://legacy.invalid", "AWS_ACCESS_KEY_ID": "legacy-access",
               "AWS_SECRET_ACCESS_KEY": "legacy-secret", "AWS_DEFAULT_REGION": "legacy-region",
               "VULTR_BUCKET_PATH": "legacy-bucket/custom-prefix", "VULTR_S3_ENDPOINT": "https://other.invalid",
               "VULTR_S3_ACCESS_KEY": "other-access", "VULTR_S3_SECRET_KEY": "other-secret",
               "VULTR_S3_BUCKET": "other-bucket"}
        with mock.patch.object(storage, "runtime_env", return_value=env), mock.patch.object(storage.boto3, "client") as client:
            self.assertEqual(storage._settings(), ("legacy-bucket", "custom-prefix"))
            storage._client()
        self.assertEqual(client.call_args.kwargs, {"endpoint_url": "https://legacy.invalid", "aws_access_key_id": "legacy-access",
                                                  "aws_secret_access_key": "legacy-secret", "region_name": "legacy-region"})

    def test_coordinates_require_three_finite_numbers(self):
        with mock.patch.object(storage, "read_json_object", return_value={"points": [{"point": [1, 2, 3]}]}):
            self.assertEqual(storage.read_lesion_coordinates(), {"baseline": [1., 2., 3.], "followup": [1., 2., 3.]})
        for point in ([1, 2], [1, 2, float("nan")], [1, float("inf"), 3], [1, 2, "invalid"]):
            with self.subTest(point=point), mock.patch.object(storage, "read_json_object", return_value={"points": [{"point": point}]}):
                with self.assertRaises(RuntimeError):
                    storage.read_lesion_coordinates()


class StoredProgressionTests(unittest.TestCase):
    def setUp(self):
        for cached in (progression_mesh._surface, progression_mesh.progression_vtp, progression_mesh._cached_vultr_progression_vtp):
            cached.cache_clear()
            self.addCleanup(cached.cache_clear)

    def test_module_import_and_stored_frame_work_without_scikit_image(self):
        original_import = builtins.__import__
        def without_skimage(name, *args, **kwargs):
            if name == "skimage" or name.startswith("skimage."):
                raise ModuleNotFoundError("No module named skimage")
            return original_import(name, *args, **kwargs)
        with mock.patch("builtins.__import__", side_effect=without_skimage):
            importlib.reload(progression_mesh)
            with mock.patch.object(progression_mesh, "read_object_bytes", return_value=b"<VTKFile/>") as read:
                self.assertEqual(progression_mesh.cached_progression_vtp(0), b"<VTKFile/>")
                read.assert_called_once_with("progression/frame-00.vtp")
            with self.assertRaisesRegex(RuntimeError, "requires scikit-image"):
                progression_mesh._surface("missing.nii.gz")
        progression_mesh._cached_vultr_progression_vtp.cache_clear()

    def test_invalid_frame_does_not_read_storage(self):
        with mock.patch.object(progression_mesh, "read_object_bytes") as read:
            for index in (-1, 8):
                with self.assertRaises(RuntimeError):
                    progression_mesh.cached_progression_vtp(index)
            read.assert_not_called()


if __name__ == "__main__":
    unittest.main()
