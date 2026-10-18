"""Build the per-subject fracture-risk table from the published HFValid metadata.

Source: HFValid_Collection_v3/HFValid_Metadata.csv, distributed with the HFValid
collection (https://amsacta.unibo.it/id/eprint/8431/, CC BY 4.0). ARF0 and MSF are
the dataset authors' results from their subject-specific finite-element models;
nothing here recomputes them.

Run from the repository root:

    python scripts/bone_fea/build_risk_table.py --csv HFValid_Metadata.csv --output public/models/hfvalid-risk.json

Keeps age, height, weight, modelled side, fracture follow-up, ARF0 and MSF for
each subject and drops every scanner and calibration column. ARF0 is written to
0.1 % and MSF to 1 N, the precision the dashboard shows. Cohort quartiles use the
inclusive (linear interpolation) method on the published values, then the same
rounding. The output is deterministic: same CSV in, same bytes out.
"""
import argparse
import csv
import json
import re
import statistics
from pathlib import Path

SOURCE = {
    'citation': 'Aldieri, La Mattina, Szyszko, Baruffaldi, Viceconti (2025). HFValid collection. University of Bologna.',
    'doi': '10.6092/unibo/amsacta/8431',
    'license': 'CC BY 4.0',
    'url': 'https://amsacta.unibo.it/id/eprint/8431/',
    # Quoted from the dataset README.
    'arf0_definition': (
        'The FE model was also coupled with a multiscale falling model to estimate the Absolute '
        'Risk of Fracture at time 0 (ARF0), as reported in [Bhattacharya2019].'),
    'msf_definition': (
        'Each FE model was simulated 28 times with different load and boundary condition '
        'orientations and, for each simulation, the critical load that would cause a fracture was '
        'calculated; the minimum critical load over the 28 orientations is referred to as the '
        'Minimum Sidefall Strength (MSF) [Altai2019].'),
    'follow_up': (
        'Inclusion criteria: resident in the Emilia Romagna region (required to follow-up '
        'occurrence of fractures); alive for at least 5 years after the CT scan, or fractured '
        'within 5 years. Fracture status 1 = fractured, with the time interval (in days) between '
        'the CT scan and the fracture.'),
}

# Peak trochanter impact force of a sideways fall: 2.90 kN for a 5th-percentile
# woman, 4.26 kN for a 95th-percentile woman.
FALL_FORCE = {
    'low_newtons': 2900,
    'high_newtons': 4260,
    'citation': 'van den Kroonenberg et al. 1995, PubMed 8618384',
}

ID = 'PatientID'
# The published header spells it "fracure"; accept a corrected spelling too.
DAYS = ('Days between fracure and CT', 'Days between fracture and CT')
COLUMNS = ('Sex', 'Age', 'Height', 'Weight', 'Side', 'FractureStatus', 'ARF0 (%)', 'MSF (N)')


def _number(text):
    """A CSV decimal ("47.1" or "47,1") as an int when whole, else a float."""
    value = float(text.strip().replace(',', '.'))
    return int(value) if value.is_integer() else value


def load_subjects(csv_path):
    """Subjects keyed by PatientID, sorted, with only the columns the table keeps."""
    with open(csv_path, newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        header = [name.strip() for name in reader.fieldnames or []]
        reader.fieldnames = header
        days_column = next((name for name in DAYS if name in header), None)
        missing = [name for name in (ID, *COLUMNS) if name not in header]
        if missing or days_column is None:
            raise ValueError(f'Missing columns: {missing or list(DAYS)}')
        subjects = {}
        for line, row in enumerate(reader, start=2):
            if not any((value or '').strip() for value in row.values()):
                continue
            case_id = row[ID].strip()
            if not re.fullmatch(r'Pat\d{3}', case_id) or case_id in subjects:
                raise ValueError(f'Line {line}: bad or repeated PatientID {case_id!r}')
            if row['Sex'].strip() != 'F':
                raise ValueError(f'Line {line}: HFValid includes only female subjects')
            side = row['Side'].strip()
            status = row['FractureStatus'].strip()
            days = (row[days_column] or '').strip()
            if side not in ('R', 'L') or status not in ('0', '1'):
                raise ValueError(f'Line {line}: bad Side or FractureStatus')
            if (status == '1') != bool(days):
                raise ValueError(f'Line {line}: days to fracture must be given exactly when fractured')
            arf0, msf = _number(row['ARF0 (%)']), _number(row['MSF (N)'])
            if not 0 <= arf0 <= 100 or msf <= 0:
                raise ValueError(f'Line {line}: ARF0 or MSF out of range')
            subjects[case_id] = {
                'age': _number(row['Age']),
                'height_cm': _number(row['Height']),
                'weight_kg': _number(row['Weight']),
                'side': side,
                'arf0_percent': arf0,
                'msf_newtons': msf,
                'fractured_within_followup': status == '1',
                'days_ct_to_fracture': int(_number(days)) if days else None,
            }
    if not subjects:
        raise ValueError('No subjects in the CSV')
    return dict(sorted(subjects.items()))


def _summary(values, decimals):
    q1, median, q3 = statistics.quantiles(values, n=4, method='inclusive')
    stats = {'min': min(values), 'q1': q1, 'median': median, 'q3': q3, 'max': max(values)}
    return {key: round(value, decimals) if decimals else round(value) for key, value in stats.items()}


def build_table(subjects):
    """The hfvalid-risk.json document for subjects as returned by load_subjects."""
    arf0 = [s['arf0_percent'] for s in subjects.values()]
    msf = [s['msf_newtons'] for s in subjects.values()]
    return {
        'source': dict(SOURCE),
        'fall_force': dict(FALL_FORCE),
        'cohort': {
            'n': len(subjects),
            'fractured': sum(s['fractured_within_followup'] for s in subjects.values()),
            'arf0_percent': _summary(arf0, 1),
            'msf_newtons': _summary(msf, 0),
        },
        'subjects': {
            case_id: dict(s, arf0_percent=round(s['arf0_percent'], 1), msf_newtons=round(s['msf_newtons']))
            for case_id, s in subjects.items()
        },
    }


def render(table):
    return json.dumps(table, indent=2, ensure_ascii=False) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', type=Path, required=True, help='HFValid_Metadata.csv from the HFValid collection')
    parser.add_argument('--output', type=Path, required=True, help='Where to write hfvalid-risk.json')
    args = parser.parse_args()
    table = build_table(load_subjects(args.csv))
    args.output.write_text(render(table), encoding='utf-8', newline='\n')
    print(f"Wrote {args.output}: {table['cohort']['n']} subjects, {table['cohort']['fractured']} fractured")
