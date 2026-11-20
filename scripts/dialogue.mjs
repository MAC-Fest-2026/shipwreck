import { writeFileSync } from 'node:fs'

const groups = {
  IDLE_DEBRIS: [2, 'steady', [
    ['mara', 'Stay together. Nobody lets go of the wood.'], ['hollis', 'Forty years fishing. Never seen a fin like that.'],
    ['jay', 'Is it coming back?'], ['priya', 'Keep your chin above the water.'], ['dev', 'Ana, can you still hear me?'], ['elias', 'The boards are slipping from the lashings.'],
  ]],
  APPROACH: [6, 'hope', [
    ['ana', 'Dev, listen. That is a rotor!'], ['priya', 'Wave slowly. Save your strength.'], ['jay', 'Here! We are right here!'],
    ['mara', 'Raise your arms. Give them something to see.'], ['tommy', 'That is the best noise I have ever heard.'], ['reyes', 'I see orange vests. Coming in low.'],
  ]],
  HANDOVER: [8, 'steady', [
    ['reyes', 'All souls spotted. You have control.'], ['reyes', 'Hold her level. The winch is yours.'], ['reyes', 'I have visual. Start with the swimmers.'],
    ['reyes', 'The searchlight is on. Your controls.'], ['reyes', 'Green deck to starboard. Bring them over.'], ['reyes', 'Eight vests in sight. Begin the recovery.'],
  ]],
  IDLE_WARNING: [5, 'panic', [
    ['jay', 'Why are we still down here?'], ['tommy', 'I did not survive a shipwreck to be lunch.'], ['mara', 'Bring the hook down. We are losing time.'],
    ['ana', 'Over here! Please!'], ['priya', 'We cannot keep everyone above water much longer.'], ['elias', 'The circling pattern is tightening.'],
  ]],
  SHARK_SPOTTED: [6, 'urgent', [
    ['elias', 'Fin. Two o’clock.'], ['mara', 'Everybody stop kicking. Stay still.'], ['tommy', 'Something is cutting through the foam.'],
    ['hollis', 'Watch the water beside the raft.'], ['ana', 'I can see another one!'], ['priya', 'Hands on the boards. Keep your legs still.'],
  ]],
  SHARK_TELEGRAPH: [7, 'panic', [
    ['jay', 'It is looking at me!'], ['tommy', 'Pull me up. Pull me up right now!'], ['ana', 'It is coming straight at us!'],
    ['dev', 'Can you get the hook any closer?'], ['elias', 'That one is closing fast.'], ['mara', 'It is turning in. Get clear!'],
  ]],
  QUICK_SAVE: [9, 'relief', [
    ['jay', 'Did you see that?'], ['hollis', 'Nice flying, kid.'], ['mara', 'That was close. Keep climbing.'],
    ['dev', 'I felt it brush my boot.'], ['ana', 'Another second and it had me.'], ['tommy', 'I am never ordering shark again.'],
  ]],
  SURVIVOR_LOST: [10, 'grief', [
    ['ana', 'No! Somebody grab them!'], ['mara', 'Eyes forward. We keep the rest alive.'], ['elias', 'I lost sight of the vest.'],
    ['priya', 'One went under. Keep moving.'], ['jay', 'They were right beside me.'], ['oduya', 'Stay with the people you can reach.'],
  ]],
  SURVIVOR_GRABBED: [4, 'hope', [
    ['tommy', 'Got me! Oh, I love you, flying machine.'], ['priya', 'Breathe. Look at the aircraft.'], ['hollis', 'Now haul this old man up.'],
    ['mara', 'Harness is clear. Bring us across.'], ['ana', 'I have it. Go!'], ['dev', 'Careful. I am hanging on.'],
  ]],
  DANGLING: [3, 'panic', [
    ['hollis', 'My knees are in the next county.'], ['jay', 'Please keep the hook closed.'], ['mara', 'Get us over the green lights.'],
    ['ana', 'Just a little higher!'], ['dev', 'I can see the deck.'], ['tommy', 'I miss floors. I really miss floors.'],
  ]],
  SURVIVOR_DELIVERED: [6, 'relief', [
    ['oduya', 'Got you. Blanket is coming.'], ['oduya', 'You are safe on deck. Sit by the rail.'], ['oduya', 'Another one aboard. Make some room.'],
    ['oduya', 'Steady landing. We have them.'], ['oduya', 'That is it. Let go of the cable.'], ['oduya', 'Come under the light. We can warm you here.'],
  ]],
  MEGALODON_WARNING: [9, 'urgent', [
    ['elias', 'That shadow is a building.'], ['mara', 'Brace! Something is under the raft.'], ['hollis', 'That is the one that hit the ship.'],
    ['ana', 'The whole raft is lifting!'], ['reyes', 'Large contact under you. Be ready to climb.'], ['jay', 'The water is moving the wrong way.'],
  ]],
  MEGALODON_BREACH: [11, 'panic', [
    ['hollis', 'Merciful heavens.'], ['ana', 'It is huge!'], ['mara', 'The raft is gone. Count the vests.'],
    ['reyes', 'Climb! Get the cable clear!'], ['dev', 'The boards are coming apart!'], ['priya', 'Keep floating. Help can still see you.'],
  ]],
  ALL_ABOARD: [11, 'relief', [
    ['oduya', 'That is everyone. Hold on, we are going home.'], ['reyes', 'All souls clear. Good flying.'], ['oduya', 'Take the helm. Follow the lighthouse.'],
    ['oduya', 'Everyone has a place. Bring us in.'], ['oduya', 'Close the hatches. We are underway.'], ['reyes', 'Deck is clear. Switching to the boat.'],
  ]],
  BOAT_HAZARD: [6, 'urgent', [
    ['elias', 'Debris on the bow.'], ['tommy', 'Rock! Mind the rock!'], ['mara', 'Keep in the deepest water.'],
    ['hollis', 'Watch the break in the waves.'], ['oduya', 'Give that obstruction room.'], ['oduya', 'Stay near the lighthouse bearing.'],
  ]],
  BOAT_COLLISION: [8, 'urgent', [
    ['dev', 'We are okay. Keep going.'], ['hollis', 'Gentle, kid. Gentle.'], ['oduya', 'Hull took a hit. Check your heading.'],
    ['oduya', 'We are still moving. Ease back into the channel.'], ['mara', 'Hold fast. Keep the bow clear.'], ['elias', 'Impact below the waterline.'],
  ]],
  LUNGE_WARNING: [10, 'panic', [
    ['ana', 'It is behind us!'], ['mara', 'Full throttle, now!'], ['oduya', 'See that wake? Turn clear of it.'],
    ['oduya', 'Break away from its line.'], ['hollis', 'That fin is gaining on us.'], ['jay', 'It followed us from the wreck!'],
  ]],
  ISLAND_SIGHTED: [5, 'hope', [
    ['priya', 'Lights. That is land.'], ['jay', 'Is that a lighthouse?'], ['oduya', 'Harbor ahead. Bring the speed down.'],
    ['hollis', 'I can see the dock from here.'], ['mara', 'Channel lights. Follow them in.'], ['oduya', 'Look for the lights at the dock.'],
  ]],
  LANDED: [11, 'relief', [
    ['dev', 'Ana. We are alive.'], ['mara', 'Every one of you counts. Remember that.'], ['oduya', 'We are alongside. Take your time.'],
    ['priya', 'One at a time. I can help you up.'], ['oduya', 'Welcome ashore.'], ['hollis', 'I think I will walk home from here.'],
  ]],
}

const lines = Object.entries(groups).flatMap(([event, [priority, emotion, entries]]) =>
  entries.map(([speaker, text], index) => ({
    id: event.toLowerCase() + '_' + String(index + 1).padStart(2, '0'), speaker,
    trigger: { event }, text, priority, cooldownMs: 6000, maxPlays: 1, emotion,
  })),
)
writeFileSync('public/dialogue/lines.en.json', JSON.stringify(lines, null, 2) + '\n')
