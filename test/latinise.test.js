import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';
import { toLatin, hasCyrillic } from '../src/utils/latinise.js';

let Staff, Song, Artist;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
});
after(stop);
beforeEach(reset);

async function login() {
  await Staff.create({
    email: 'radnik@test.local', name: 'Radnik', role: 'worker',
    passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email: 'radnik@test.local', password: 'lozinka1234' }
  });
  return res.body.token;
}

describe('transliteration', () => {
  test('Serbian Cyrillic', () => {
    assert.equal(toLatin('Ђорђе Марјановић'), 'Đorđe Marjanović');
    assert.equal(toLatin('Џаба љубав њена'), 'Džaba ljubav njena');
    assert.equal(toLatin('Ћirilica'), 'Ćirilica');
  });

  test('Macedonian Cyrillic', () => {
    assert.equal(toLatin('Во една пролет'), 'Vo edna prolet');
    assert.equal(toLatin('Тоше Проески'), 'Toše Proeski');
    assert.equal(toLatin('Ѓорѓи'), 'Gjorgji');
  });

  test('Russian Cyrillic gives our alphabet, not the English one', () => {
    assert.equal(toLatin('Девушка моего города'), 'Devuška moego goroda');
    assert.equal(toLatin('Маленькая девочка'), 'Malenkaja devočka');
    // Not "Devushka" — the site spells this sound š everywhere else.
    assert.ok(!toLatin('Девушка').includes('sh'));
  });

  test('capitalization of digraphs depends on the next letter', () => {
    assert.equal(toLatin('Љубав'), 'Ljubav');
    assert.equal(toLatin('ЉУБАВ'), 'LJUBAV');
    assert.equal(toLatin('Његош'), 'Njegoš');
  });

  test('Latin text passes untouched', () => {
    const text = '[Am]Snijeg pade na be[Dm]har, na voće — čćžšđ 123!?';
    assert.equal(toLatin(text), text);
  });

  test('a homoglyph in the middle of Latin text', () => {
    // A Cyrillic 'а' hiding in "sela": invisible to the eye, unsearchable.
    const broken = 'nema selаmeta';
    assert.ok(hasCyrillic(broken));
    assert.equal(toLatin(broken), 'nema selameta');
  });

  test('does not touch punctuation or ChordPro markers', () => {
    assert.equal(toLatin('[Am]За кого?'), '[Am]Za kogo?');
  });
});

describe('the guard on the model', () => {
  test('the title is transliterated on save', async () => {
    const token = await login();
    const res = await api('/songs', {
      method: 'POST', token,
      body: {
        title: 'Во една пролет', artist: 'Karolina Gočeva',
        content: '[Am]tekst', originalKey: 'Am', status: 'published'
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.song.title, 'Vo edna prolet');
  });

  test('the slug is built from Latin, not from an empty string', async () => {
    const token = await login();
    const res = await api('/songs', {
      method: 'POST', token,
      body: {
        title: 'Девушка моего города', artist: 'Đorđe Marjanović',
        content: '[Am]tekst', originalKey: 'Am'
      }
    });

    // AI-TRAP: slugify strips Cyrillic, so without the guard this fell back to
    // the generic "pjesma" plus a counter — nine songs shared that fate.
    assert.equal(res.body.song.slug, 'devuska-moego-goroda');
    assert.ok(!res.body.song.slug.startsWith('pjesma'));
  });

  test('the lyrics are cleaned, the chord markers stay', async () => {
    const token = await login();
    const res = await api('/songs', {
      method: 'POST', token,
      body: {
        title: 'Test', artist: 'Neko',
        content: '[Am]nema selаmeta\n[Dm]За кого?', originalKey: 'Am'
      }
    });

    const song = await Song.findById(res.body.song._id);
    assert.equal(song.arrangements[0].content, '[Am]nema selameta\n[Dm]Za kogo?');
  });

  test('a Cyrillic artist name does not create a duplicate', async () => {
    const token = await login();

    await api('/songs', {
      method: 'POST', token,
      body: { title: 'Prva', artist: 'Toše Proeski', content: '[Am]a', originalKey: 'Am' }
    });
    await api('/songs', {
      method: 'POST', token,
      body: { title: 'Druga', artist: 'Тоше Проески', content: '[Am]a', originalKey: 'Am' }
    });

    const artists = await Artist.find({ name: /Proeski/i });
    assert.equal(artists.length, 1, 'cirilicno ime je napravilo drugog izvodjaca');
    assert.equal(artists[0].songCount, 2);
  });

  test('nothing in the database stays in Cyrillic', async () => {
    const token = await login();
    await api('/songs', {
      method: 'POST', token,
      body: {
        title: 'Три года ты мне снилась', artist: 'Ђорђе Марјановић',
        content: '[Am]Марко Поло', originalKey: 'Am', tags: ['ретро']
      }
    });

    const song = await Song.findOne().lean();
    const artist = await Artist.findOne().lean();
    for (const value of [song.title, song.slug, song.searchTitle, song.arrangements[0].content, ...song.tags, artist.name, artist.slug]) {
      assert.ok(!hasCyrillic(value), `jos je cirilicno: ${value}`);
    }
  });
});
