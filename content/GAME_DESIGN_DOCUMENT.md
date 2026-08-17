# The Quarantine — Game Design Document

## One-line vision

An intimate, first-person story game set in a carefully observed house, where
ordinary routines become a readable system of memory, uncertainty, and choice.

## Player promise

The player should feel curious, oriented, and quietly responsible. Every room,
sound, object, and journal entry gives them something specific to notice. The
game rewards attention rather than speed, and lets the meaning of an event
remain uncertain until the player has enough evidence to decide.

## Experience pillars

1. **A house with continuity** — rooms change through time, weather, lighting,
   sound, and the consequences of earlier actions.
2. **Evidence before exposition** — the player reconstructs what happened from
   objects, voices, journal entries, broadcasts, and repeatable observations.
3. **Gentle, consequential agency** — choices alter access, trust, pacing, and
   the shape of later scenes without turning the experience into a score chase.
4. **A memorable voice world** — dialogue and ambience carry personality,
   distance, hesitation, and emotional texture; every important voice has a
   clear identity and approval status.
5. **Accessible immersion** — the complete first day can be played with a
   keyboard, captions, readable focus states, adjustable text, and clear
   recovery from every pause or save.

## Core loop

1. Enter a room and establish the current time and emotional temperature.
2. Observe objects, light, sound, and characters without rushing.
3. Choose a small interaction: inspect, listen, ask, write, compare, or wait.
4. Record a journal entry with certainty, source, and revision history.
5. Notice a consequence in the house or in a relationship.
6. Continue, rest, or revisit an earlier clue with new context.

## World and structure

The house is the primary character. The first day teaches the space through a
small set of rooms, a consistent clock, and a restrained sound bed. Later days
reuse the accepted interaction loop with new context, disruptions, and three
endings. No scene depends on a single unrepeatable input: state is saved and
restored deterministically.

## Emotional range

The performance target is not constant intensity. The palette moves between
comfort, curiosity, awkwardness, suspicion, tenderness, grief, relief, and
quiet dread. Sound, pauses, gaze, distance, and the player's ability to defer a
choice are as important as spoken lines. Voice assets are hash-matched and only
approved material may ship.

## System rules

- Story state is typed, deterministic, and revisioned.
- Journal entries preserve source, certainty, corroboration, and protected
  status.
- A save captures the complete session and player metadata atomically.
- Every important event has a text-first and captioned representation.
- The Unity implementation follows the accepted planner packets; it does not
  redefine the game's meaning to simplify a port.

## Release shape

The first release is a polished Day 1 vertical slice: a Windows build with the
house loop, one complete sound bed, text-first dialogue, a working journal,
save/restore, accessibility settings, and a verified route through the first
ending gate. Later days extend the same rules rather than introducing a second
interaction language.

## Out of scope

No combat, loot economy, procedural story generator, or unreviewed generated
voice is part of the first release. The project stays small enough that every
room, line, and state transition can be tested and remembered.
