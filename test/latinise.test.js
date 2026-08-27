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

describe('preslovljavanje', () => {
  test('srpska cirilica', () => {
    assert.equal(toLatin('Ђорђе Марјановић'), 'Đorđe Marjanović');
    assert.equal(toLatin('Џаба љубав њена'), 'Džaba ljubav njena');
    assert.equal(toLatin('Ћirilica'), 'Ćirilica');
  });

  test('makedonska cirilica', () => {
    assert.equal(toLatin('Во една пролет'), 'Vo edna prolet');
    assert.equal(toLatin('Тоше Проески'), 'Toše Proeski');
    assert.equal(toLatin('Ѓорѓи'), 'Gjorgji');
  });

  test('ruska cirilica daje nase pismo, ne englesko', () => {
    assert.equal(toLatin('Девушка моего города'), 'Devuška moego goroda');
    assert.equal(toLatin('Маленькая девочка'), 'Malenkaja devočka');
    // Not "Devushka" — the site spells this sound š everywhere else.
    assert.ok(!toLatin('Девушка').includes('sh'));
  });

  test('velika slova kod dvoslova zavise od sljedeceg slova', () => {
    assert.equal(toLatin('Љубав'), 'Ljubav');
    assert.equal(toLatin('ЉУБАВ'), 'LJUBAV');
    assert.equal(toLatin('Његош'), 'Njegoš');
  });

  test('latinicni tekst prolazi netaknut', () => {
    const text = '[Am]Snijeg pade na be[Dm]har, na voće — čćžšđ 123!?';
    assert.equal(toLatin(text), text);
  });

  test('homoglif usred latinicnog teksta', () => {
    // A Cyrillic 'а' hiding in "sela": invisible to the eye, unsearchable.
    const broken = 'nema selаmeta';
    assert.ok(hasCyrillic(broken));
    assert.equal(toLatin(broken), 'nema selameta');
  });

  test('ne dira interpunkciju ni ChordPro oznake', () => {
    assert.equal(toLatin('[Am]За кого?'), '[Am]Za kogo?');
  });
});

describe('brana na modelu', () => {
  test('naslov se preslovi pri snimanju', async () => {
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

  test('slug se gradi od latinice, ne od praznog niza', async () => {
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

  test('tekst pjesme se cisti, oznake akorda ostaju', async () => {
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

  test('cirilicno ime izvodjaca ne pravi dvojnika', async () => {
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

  test('nista u bazi ne ostaje na cirilici', async () => {
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
