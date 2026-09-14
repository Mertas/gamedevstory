#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kern -> компактный JSON нот (для демо экрана разработки «разработка играет Баха»).

Модель (по humlib): каждая строка = срез; время строки = min(оставшееся время активных
токенов); '.' тянет предыдущий токен; '[', '_', ']' — лигатуры; 'q' — форшлаги (0 времени);
'space' внутри поля — аккорд. Длительности: 1=целая..32; точка ×1.5, две ×1.75. Единица
времени — 1/16 (ticks=16/длительность). Вывод: {"title","bwv","mm","notes":[[t,midi,dur],...]}
"""
import json
import re
import sys

PITCH = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
ACC = {'#': 1, '-': -1, 'n': 0}


def token_dur(tok: str):
    """длительность токена в ticks (1/16). None если не токен."""
    m = re.match(r'^\[?(\d+)(\.*)', tok)
    if not m:
        return None
    base = 16.0 / int(m.group(1))
    dots = len(m.group(2))
    if dots == 1:
        base *= 1.5
    elif dots == 2:
        base *= 1.75
    return base


def token_pitch(tok: str):
    """midi-нота из kern-токена, или None (рест/прочее)."""
    core = re.sub(r'^\[?\d+\.*', '', tok)  # снять длительность (и ведущую лигу)
    # оставляем только буквы высоты и знаки альтерации — любой служебный хвост срезается
    core = re.sub(r'[^a-gA-G#\-n]', '', core)
    if not core or core == 'r':
        return None
    m = re.match(r'^([a-gA-G]+)([#\-n]*)$', core)
    if not m:
        return None
    letters, accs = m.group(1), m.group(2)
    letter = letters[0].lower()
    octave_shift = len(letters) - 1
    acc = 0
    for a in accs:
        acc += ACC.get(a, 0)
    # керн: c = C4 (midi 60), cc = C5, C = C3; строчные — вверх, заглавные — вниз
    if letters[0].islower():
        base = 60 + PITCH[letter] + 12 * octave_shift
    else:
        base = 60 + PITCH[letter] - 12 * (octave_shift + 1)
    return base + acc


def is_rest(tok: str) -> bool:
    core = tok.strip().rstrip('\\')
    return bool(re.match(r'^\[?\d+\.*r', core))


def has_tie_start(tok: str) -> bool:
    return tok.startswith('[')


def has_tie_cont(tok: str) -> bool:
    return ']' in tok or '_' in tok


def parse_kern(text: str):
    lines = text.split('\n')
    meta = {'title': '', 'bwv': '', 'mm': 120}
    notes = []  # [t, midi, dur_ticks]
    spines = 0
    remaining = []          # сколько тиков ещё звучит текущий токен в потоке
    active = []             # индекс открытой лигатуры (в notes) или None
    tie_pitch = []          # питч открытой лигатуры
    time = 0.0
    grace_count = 0
    chord_count = 0
    measure_ticks = 0.0
    measures = []
    for raw in lines:
        line = raw.rstrip('\r')
        if not line:
            continue
        if line.startswith('!!!'):
            if line.startswith('!!!OTL:'):
                meta['title'] = line.split(':', 1)[1].strip()
            elif line.startswith('!!!SCT:'):
                meta['bwv'] = line.split(':', 1)[1].strip()
            continue
        if line.startswith('!'):
            continue
        if line.startswith('**'):
            # старт спинов: каждый таб-раздел — отдельный голос
            spines = len([f for f in line.split('\t') if f.strip()])
            remaining = [0.0] * spines
            active = [None] * spines
            tie_pitch = [None] * spines
            continue
        if line.startswith('*'):
            fields = line.split('\t')
            i = 0
            while i < len(fields):
                f = fields[i].strip()
                if f == '*v':
                    # серия подряд *v = группа слияния: k голосов → 1 (−(k−1))
                    j = i
                    while j + 1 < len(fields) and fields[j + 1].strip() == '*v':
                        j += 1
                    for k in range(j, i, -1):
                        spines -= 1
                        if len(remaining) > k:
                            del remaining[k]
                            del active[k]
                            del tie_pitch[k]
                    if 'spine_merge' not in meta:
                        meta['spine_merge'] = []
                    meta['spine_merge'].append((round(time, 3), j - i + 1))
                    i = j + 1
                    continue
                if f == '*^':
                    spines += 1
                    remaining.append(0.0)
                    active.append(None)
                    tie_pitch.append(None)
                elif f.startswith('*MM'):
                    try:
                        meta['mm'] = int(f[3:])
                    except ValueError:
                        pass
                i += 1
            continue
        fields = line.split('\t')
        while fields and fields[-1].strip() == '':
            fields.pop()  # хвостовые пустые поля не считаем голосами
        if all(f.strip().startswith('=') for f in fields if f.strip()):
            measures.append(round(time, 3))
            continue
        if len(fields) > spines:
            # формат сам себя описывает: больше полей — значит голосов больше (была ошибка счёта)
            meta['spine_autofix'] = meta.get('spine_autofix', 0) + 1
            spines = len(fields)
        while len(remaining) < spines:
            remaining.append(0.0)
            active.append(None)
            tie_pitch.append(None)
        while len(fields) < spines:
            fields.append('.')  # недостающее поле — «тянется» предыдущее
        n = max(spines, 1)
        contrib = []
        for i in range(n):
            f = fields[i].strip()
            if f == '.' or f == '':
                contrib.append(remaining[i] if remaining[i] > 0 else 0.0)
                continue
            sub = f.split(' ')
            if len(sub) > 1:
                chord_count += 1
            best = None
            for tok in sub:
                if not tok:
                    continue
                if 'q' in tok:
                    grace_count += 1
                    p = token_pitch(tok.replace('q', ''))
                    if p is not None:
                        notes.append([round(time, 3), p, 0.35, i])
                    continue
                d = token_dur(tok)
                if d is None:
                    continue
                if is_rest(tok):
                    remaining[i] = d
                    active[i] = None
                    tie_pitch[i] = None
                    best = d if best is None else min(best, d)
                    continue
                p = token_pitch(tok)
                if p is None:
                    if not is_rest(tok) and meta.get('unparsed_n', 0) < 40:
                        meta.setdefault('unparsed', []).append(tok)
                        meta['unparsed_n'] = meta.get('unparsed_n', 0) + 1
                    continue
                if has_tie_cont(tok) and active[i] is not None and tie_pitch[i] == p:
                    notes[active[i]][2] += d  # продолжение лигатуры — без атаки
                    remaining[i] = d
                    best = d if best is None else min(best, d)
                    if ']' in tok:
                        active[i] = None
                        tie_pitch[i] = None
                    continue
                notes.append([round(time, 3), p, d, i])
                if has_tie_start(tok):
                    active[i] = len(notes) - 1
                    tie_pitch[i] = p
                else:
                    active[i] = None
                    tie_pitch[i] = None
                remaining[i] = d
                best = d if best is None else min(best, d)
            contrib.append(best if best is not None else (remaining[i] if remaining[i] > 0 else 0.0))
        adv = min(contrib) if contrib else 0.0
        for i in range(len(remaining)):
            remaining[i] = max(0.0, remaining[i] - adv)
        time += adv
        measure_ticks += adv
    meta['unparsed_n'] = meta.get('unparsed_n', 0)
    meta['total_ticks'] = round(time, 3)
    meta['measures'] = len(measures)
    deltas = [round(measures[i + 1] - measures[i], 3) for i in range(len(measures) - 1)]
    meta['bar_anomalies'] = [(i + 1, deltas[i]) for i in range(len(deltas)) if abs(deltas[i] - 16) > 0.01]
    meta['grace'] = grace_count
    meta['chords'] = chord_count
    notes.sort(key=lambda x: (x[0], x[1]))
    return meta, notes


def main(path_in, path_out):
    text = open(path_in, encoding='utf-8', errors='replace').read()
    meta, notes = parse_kern(text)
    acc = sorted({n[1] for n in notes})
    out = {
        'title': meta['title'], 'bwv': meta['bwv'], 'mm': meta['mm'],
        'ticksPerQuarter': 4, 'notes': notes,
    }
    open(path_out, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    first10 = [(n[0], n[1]) for n in notes[:10] if n[2] > 1]
    print(f"{path_in.split('/')[-1]}: {meta['title']} ({meta['bwv']}) | нот: {len(notes)}, тактов: {meta['measures']}, "
          f"тиков: {meta['total_ticks']}, 16-х на такт: {meta['total_ticks']/max(1,meta['measures']):.1f}, "
          f"форшлагов: {meta['grace']}, аккордов: {meta['chords']}")
    print('   диапазон midi:', acc[0], '-', acc[-1], '| первые атаки (t, midi, dur):', first10[:6])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
