"""Checks the committed HFValid risk table and the CSV parser behind it.

Set HFVALID_METADATA_CSV to the dataset's HFValid_Metadata.csv to also check that
rebuilding from the published CSV reproduces the committed file byte for byte.
"""
import json
import os
import statistics
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from build_risk_table import build_table, load_subjects, render

TABLE = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'hfvalid-risk.json'
SUBJECT_KEYS = {'age', 'height_cm', 'weight_kg', 'side', 'arf0_percent', 'msf_newtons',
                'fractured_within_followup', 'days_ct_to_fracture'}
HEADER = ('PatientID;Sex;Year of birth;Age;Height;Weight;Side;FractureStatus;Days between fracure and CT;'
          'ARF0 (%);MSF (N);Intra-Extra rotation anlge;Abduction angle;coeff a;coeff b;Manufacturer')


def write_csv(folder, rows, header=HEADER):
    path = Path(folder) / 'meta.csv'
    path.write_bytes(('﻿' + '\r\n'.join((header, *rows)) + '\r\n').encode('utf-8'))
    return path


class CommittedTableTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.table = json.loads(TABLE.read_text(encoding='utf-8'))
        cls.subjects = cls.table['subjects']

    def test_shape_matches_contract(self):
        self.assertEqual(list(self.table), ['source', 'fall_force', 'cohort', 'subjects'])
        self.assertEqual(set(self.table['source']), {'citation', 'doi', 'license', 'url', 'arf0_definition',
                                                     'msf_definition', 'follow_up'})
        self.assertEqual(self.table['source']['license'], 'CC BY 4.0')
        self.assertEqual(self.table['source']['doi'], '10.6092/unibo/amsacta/8431')
        self.assertEqual(self.table['source']['url'], 'https://amsacta.unibo.it/id/eprint/8431/')
        for summary in ('arf0_percent', 'msf_newtons'):
            self.assertEqual(list(self.table['cohort'][summary]), ['min', 'q1', 'median', 'q3', 'max'])
        for case_id, subject in self.subjects.items():
            self.assertEqual(set(subject), SUBJECT_KEYS, case_id)
        text = TABLE.read_text(encoding='utf-8')
        for dropped in ('Manufacturer', 'coeff', 'KVP', 'Year of birth', 'rotation', 'Abduction'):
            self.assertNotIn(dropped, text)

    def test_101_subjects_and_4_fractured(self):
        self.assertEqual(len(self.subjects), 101)
        self.assertEqual(self.table['cohort']['n'], 101)
        self.assertEqual(self.table['cohort']['fractured'], 4)
        fractured = {case_id: s['days_ct_to_fracture'] for case_id, s in self.subjects.items()
                     if s['fractured_within_followup']}
        self.assertEqual(fractured, {'Pat004': 1529, 'Pat009': 1070, 'Pat022': 999, 'Pat029': 1325})
        for case_id, subject in self.subjects.items():
            if not subject['fractured_within_followup']:
                self.assertIsNone(subject['days_ct_to_fracture'], case_id)

    def test_pat001(self):
        self.assertEqual(self.subjects['Pat001'], {
            'age': 78, 'height_cm': 150, 'weight_kg': 55, 'side': 'R', 'arf0_percent': 47.1,
            'msf_newtons': 1339, 'fractured_within_followup': False, 'days_ct_to_fracture': None})

    def test_cohort_summary_matches_subjects(self):
        cohort = self.table['cohort']
        self.assertEqual(cohort['arf0_percent']['median'], 44.3)
        arf0 = [s['arf0_percent'] for s in self.subjects.values()]
        msf = [s['msf_newtons'] for s in self.subjects.values()]
        self.assertEqual(cohort['arf0_percent']['min'], min(arf0))
        self.assertEqual(cohort['arf0_percent']['max'], max(arf0))
        self.assertEqual(cohort['msf_newtons']['min'], min(msf))
        self.assertEqual(cohort['msf_newtons']['max'], max(msf))
        self.assertAlmostEqual(cohort['msf_newtons']['median'], statistics.median(msf), delta=1)
        fractured_arf0 = sorted(s['arf0_percent'] for s in self.subjects.values() if s['fractured_within_followup'])
        self.assertEqual((fractured_arf0[0], fractured_arf0[-1]), (53.7, 73.2))

    def test_fall_force(self):
        self.assertEqual(self.table['fall_force'], {
            'low_newtons': 2900, 'high_newtons': 4260,
            'citation': 'van den Kroonenberg et al. 1995, PubMed 8618384'})

    @unittest.skipUnless(os.environ.get('HFVALID_METADATA_CSV'), 'HFVALID_METADATA_CSV not set')
    def test_rebuild_from_published_csv_is_identical(self):
        rebuilt = render(build_table(load_subjects(os.environ['HFVALID_METADATA_CSV'])))
        self.assertEqual(rebuilt, TABLE.read_text(encoding='utf-8'))


class ParserTests(unittest.TestCase):
    ROWS = ('Pat002;F;1926;77;165;39;R;0;;41,5735094;1298,837108;Extra30;30;-0,0047;0,0008;GE',
            'Pat001;F;1928;78;168.5;55;L;1;1070;47.10747422;1338.861427;Intra20;30;-0.0048;0.0008;GE',
            ';;;;;;;;;;;;;;;')

    def test_semicolons_decimal_commas_bom_crlf_and_misspelled_days(self):
        with TemporaryDirectory() as folder:
            subjects = load_subjects(write_csv(folder, self.ROWS))
        self.assertEqual(list(subjects), ['Pat001', 'Pat002'])
        self.assertEqual(subjects['Pat001']['height_cm'], 168.5)
        self.assertEqual(subjects['Pat001']['days_ct_to_fracture'], 1070)
        self.assertTrue(subjects['Pat001']['fractured_within_followup'])
        self.assertAlmostEqual(subjects['Pat002']['arf0_percent'], 41.5735094)
        self.assertIsNone(subjects['Pat002']['days_ct_to_fracture'])
        table = build_table(subjects)
        self.assertEqual(table['subjects']['Pat002']['arf0_percent'], 41.6)
        self.assertEqual(table['subjects']['Pat002']['msf_newtons'], 1299)
        self.assertNotIn('coeff', render(table))

    def test_corrected_days_spelling_is_accepted(self):
        header = HEADER.replace('fracure', 'fracture')
        with TemporaryDirectory() as folder:
            self.assertEqual(len(load_subjects(write_csv(folder, self.ROWS[:2], header))), 2)

    def test_output_is_deterministic(self):
        with TemporaryDirectory() as folder:
            path = write_csv(folder, self.ROWS)
            self.assertEqual(render(build_table(load_subjects(path))), render(build_table(load_subjects(path))))

    def test_inconsistent_rows_are_rejected(self):
        bad_rows = (
            'Pat003;F;1929;76;155;55;R;1;;38.1;1143.0;Extra20;30;0;0;GE',      # fractured without days
            'Pat003;F;1929;76;155;55;R;0;400;38.1;1143.0;Extra20;30;0;0;GE',   # days without fracture
            'Pat003;M;1929;76;155;55;R;0;;38.1;1143.0;Extra20;30;0;0;GE',      # not in the female cohort
            'Pat003;F;1929;76;155;55;R;0;;138.1;1143.0;Extra20;30;0;0;GE',     # ARF0 above 100 %
        )
        for row in bad_rows:
            with self.subTest(row=row), TemporaryDirectory() as folder:
                with self.assertRaises(ValueError):
                    load_subjects(write_csv(folder, (row,)))
        with TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                load_subjects(write_csv(folder, (self.ROWS[0], self.ROWS[0])))
            with self.assertRaises(ValueError):
                load_subjects(write_csv(folder, self.ROWS, HEADER.replace('MSF (N)', 'MSF')))


if __name__ == '__main__':
    unittest.main()
