import { describe, expect, it } from 'vitest'
import { looksLikeAudio } from '../../functions/src/audioSniff'

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])).concat(new Array(20).fill(0)))

describe('looksLikeAudio', () => {
  it.each([
    ['WebM (Chrome, Android)', bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42)],
    ['Ogg (Firefox)', bytes('OggS', 0, 2)],
    ['MP4 / M4A (Safari, iPhone)', bytes(0, 0, 0, 0x20, 'ftypM4A ')],
    ['3GP', bytes(0, 0, 0, 0x14, 'ftyp3gp4')],
    ['MP3 with a tag', bytes('ID3', 4, 0)],
    ['MP3 frame', bytes(0xff, 0xfb, 0x90, 0x44)],
    ['AAC frame', bytes(0xff, 0xf1, 0x50, 0x80)],
    ['WAV', bytes('RIFF', 0, 0, 0, 0, 'WAVE')],
  ])('accepts %s', (_name, data) => {
    expect(looksLikeAudio(data)).toBe(true)
  })

  it.each([
    ['a web page', bytes('<!DOCTYPE html>')],
    ['a PDF', bytes('%PDF-1.4 abc')],
    ['a PNG picture', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)],
    ['a script', bytes('#!/bin/sh\nrm -rf')],
    ['a RIFF file that is not WAV', bytes('RIFF', 0, 0, 0, 0, 'AVI ')],
    ['text', bytes('hello world, not audio')],
    ['an empty file', new Uint8Array(0)],
    ['a tiny file', Uint8Array.from([0xff])],
  ])('refuses %s', (_name, data) => {
    expect(looksLikeAudio(data)).toBe(false)
  })
})
