/*
 * Fixed project data: board schedules, cables, earthing, bill of materials, lift protection,
 * commissioning tests. Shared by the website and the written plan.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BOARDS = [
    {
      id: 'grid-main', name: 'Grid main panel (Meter 1 side)', where: 'Electrical room, ground floor', fedFrom: 'TGSPDCL Meter 1 (3-phase net meter, grid only). Export sensor is not on this meter.',
      ways: [
        ['Main switch', '4-pole moulded-case breaker 160 A, adjustable, set to about 63 A (about 80 A if Floor 2 moves here). Backup breaker for the surge protector as the maker specifies.', 'From Meter 1. Key A of the bus-tie interlock is trapped in this breaker while it is ON.'],
        ['Surge protector', 'Type 1+2, 4-pole, with its own backup breaker', 'Lightning and surge. A failed surge protector must not sit unprotected.'],
        ['1', '4-pole circuit breaker 40 A, C curve', 'Floor 1 transfer switch, position I (Floor 1 on Meter 1, default)'],
        ['2', '4-pole circuit breaker 32 A, C curve', 'Penthouse grid supply, through the Penthouse grid meter'],
        ['3', '4-pole circuit breaker 20 A, C curve', 'Pump transfer switch, position I (pumps on Meter 1). Used only if Floor 2 also moves here.'],
        ['4', '4-pole circuit breaker 40 A, C curve', 'Floor 2 transfer switch, position I (Floor 2 on Meter 1 = Layout B)'],
        ['5', 'Spare 4-pole 40 A', 'Future use (Penthouse transfer, if ever needed)'],
        ['6', '4-pole circuit breaker 160 A', 'Bus-tie breaker. Normally open. See the bus-tie schedule.'],
      ],
    },
    {
      id: 'solar-main', name: 'Solar main panel (Meter 2 side)', where: 'Electrical room, ground floor', fedFrom: 'TGSPDCL Meter 2 (3-phase two-way net meter). The inverter export sensor (CT) sits on this incomer, not only on the inverter output.',
      ways: [
        ['Main switch', '4-pole moulded-case breaker 160 A, adjustable, set to about 80 A for two-meter operation. Backup breaker for the surge protector as the maker specifies.', 'From Meter 2. Key B of the bus-tie interlock is trapped in this breaker while it is ON.'],
        ['Surge protector', 'Type 1+2, 4-pole, with its own backup breaker', 'Lightning and surge'],
        ['1', '4-pole isolator 40 A, lockable, visible break (outside, 2.44 m high)', 'Solar isolator to the PuREPower grid input. This is the only path into the inverter.'],
        ['2', '4-pole circuit breaker 40 A, C curve', 'Floor 2 transfer switch, position II (Floor 2 on Meter 2, default)'],
        ['3', '4-pole circuit breaker 40 A, C curve', 'Floor 3 grid supply, through the Floor 3 grid meter'],
        ['4', '4-pole circuit breaker 40 A, C curve', 'Floor 4 grid supply, through the Floor 4 grid meter'],
        ['5', '4-pole circuit breaker 40 A, C curve', 'Bypass line to bypass switch position II'],
        ['6', '4-pole circuit breaker 40 A, C curve', 'Floor 1 transfer switch, position II (if Floor 1 is moved to Meter 2)'],
        ['7', '4-pole breaker 32 A, C curve, with Type B earth-leakage device 30 mA (IS 17017)', 'Car charger. After Meter 2, before the inverter. Noon charging is offset by net metering. Dead in a power cut. Not on the backup bus.'],
        ['8', '4-pole circuit breaker 20 A, C curve', 'Pump transfer switch, position II (pumps on Meter 2, default). Grid side only, never through the inverter.'],
      ],
    },
    {
      id: 'floor1-transfer', name: 'Floor 1 transfer switch', where: 'Electrical room, before the Floor 1 grid meter', fedFrom: 'position I = grid main panel circuit 1 (Meter 1, default), position II = solar main panel circuit 6 (Meter 2)',
      ways: [
        ['Switch', '4-pole 40 A changeover I-0-II, breaks before it makes, can be padlocked', 'Fitted as standard alongside the Floor 2 switch. On its own it clears an empty-floor surplus on Meter 2; together with the Floor 2 switch it gives a third split. Change position only with TGSPDCL approval.'],
      ],
    },
    {
      id: 'floor2-transfer', name: 'Floor 2 transfer switch', where: 'Electrical room, before the Floor 2 grid meter', fedFrom: 'position I = grid main panel circuit 4 (Meter 1), position II = solar main panel circuit 2 (Meter 2)',
      ways: [
        ['Switch', '4-pole 40 A changeover I-0-II, breaks before it makes, can be padlocked', 'Moves Floor 2 between the meters; never connects the two meters together. Change position only with TGSPDCL approval.'],
      ],
    },
    {
      id: 'pump-transfer', name: 'Pump feeder transfer switch', where: 'Electrical room, before the Ground grid meter', fedFrom: 'position I = grid main panel circuit 3 (Meter 1), position II = solar main panel circuit 8 (Meter 2, default)',
      ways: [
        ['Switch', '4-pole 20 A changeover I-0-II, breaks before it makes, can be padlocked', 'Default position II puts the borewell, the transfer pump and the outdoor sockets on Meter 2 so May stays clear of 800 units. Position I only if Floor 2 also moves to Meter 1 (connected-load fallback). Never through the inverter. Change position only with TGSPDCL approval.'],
      ],
    },
    {
      id: 'bus-tie', name: 'Bus-tie breaker (2.10 one-meter contingency)', where: 'Electrical room, between the grid main panel and the solar main panel busbars', fedFrom: 'grid main panel circuit 6 to the solar main panel busbar',
      ways: [
        ['Breaker', '4-pole 160 A moulded-case breaker, normally open, padlocked open', 'Not a changeover. A changeover cannot feed both panels from their own meters at the same time. This breaker only ties the two busbars.'],
        ['Interlock', 'Trapped-key (Castell or equivalent). Key A released only when the Meter 1 main breaker is locked OFF. Key B released only when the Meter 2 main breaker is locked OFF. The tie accepts a key only when the other meter breaker is locked off, and closing the tie traps that key.', 'Both meters can never be paralleled. Close the tie only after TGSPDCL has removed the unused meter, phase and neutral, and given written approval. Then raise the live meter breaker setting. The 70 sq mm tie is sized for the one-meter expected peak (about 95 A), not for every appliance at once.'],
      ],
    },
    {
      id: 'bypass', name: 'Bypass switch', where: 'Electrical room, between the PuREPower and the backup main board', fedFrom: 'position I = PuREPower output, position II = bypass line from the solar main panel',
      ways: [
        ['Switch', '4-pole 63 A changeover I-0-II, breaks before it makes, padlocked on position I after commissioning', 'Never connects inverter and grid together. A lamp on the panel door is ON when the switch is on position II, so a service visit cannot leave the building without backup by mistake.'],
      ],
    },
    {
      id: 'backup-main', name: 'Backup main board', where: 'Electrical room, locked', fedFrom: 'the bypass switch',
      ways: [
        ['Main switch', '4-pole isolator 63 A', 'From the bypass switch'],
        ['Surge protector', 'Type 2, 4-pole', ''],
        ['1', 'Ground backup meter (3-phase, 63 A)', 'Feeds the Ground backup board: lift, common lights, watchman room'],
        ['2', '4-pole earth-leakage breaker 63 A 300 mA, time-delayed', 'Protects circuits 3 to 7 together'],
        ['3', '4-pole circuit breaker 10 A, C curve', 'Floor 1 backup supply, through the Floor 1 backup meter (1.5 kW limit)'],
        ['4', '4-pole circuit breaker 10 A, C curve', 'Floor 2 backup supply, through the Floor 2 backup meter (1.5 kW limit)'],
        ['5', '4-pole circuit breaker 10 A, C curve', 'Floor 3 backup supply, through the Floor 3 backup meter (1.5 kW limit)'],
        ['6', '4-pole circuit breaker 10 A, C curve', 'Floor 4 backup supply, through the Floor 4 backup meter (1.5 kW limit)'],
        ['7', '4-pole circuit breaker 10 A, C curve', 'Penthouse backup supply, through the Penthouse backup meter (1.0 kW limit)'],
        ['8', '4-pole contactor 25 A, coil from a PuREPower signal contact', 'Load-shedding switch: turns off exterior lights and half the parking lights below 30 % battery'],
        ['9', '4-pole contactor 25 A in series with the lift breaker, current relay set under the inverter phase limit', 'Drops the lift before the inverter current limit, so a lift start cannot black out the lights. Lift drive acceleration power capped by the vendor.'],
        ['10', '4-pole contactor 16 A, one geyser only, coil from inverter "grid dead and solar spare" contacts', 'Outage dump load. Closed only while the grid is dead, solar exceeds the backup load, and no phase is above 5 kW. Not a standing connection. Uses solar that cannot be exported during a cut.'],
      ],
    },
    {
      id: 'ground-backup', name: 'Ground backup board (common areas)', where: 'Electrical room or stair core', fedFrom: 'the backup main board, through the Ground backup meter',
      ways: [
        ['Main switch', '4-pole isolator 63 A', ''],
        ['1', '4-pole circuit breaker 32 A (curve as the lift vendor says) + Type B earth-leakage device or earth-leakage relay', 'Lift (to the controller at the top landing)'],
        ['2', 'Single-phase breaker with earth-leakage 6 A 30 mA Type A, phase R', 'Parking lights (half through the load-shedding switch)'],
        ['3', 'Single-phase breaker with earth-leakage 6 A 30 mA Type A, phase Y', 'Staircase and lobby lights'],
        ['4', 'Single-phase breaker with earth-leakage 6 A 30 mA Type A, phase B', 'Exterior lights (through the load-shedding switch)'],
        ['5', 'Single-phase breaker with earth-leakage 6 A 30 mA Type A, phase Y', 'CCTV, router, intercom'],
        ['6', 'Single-phase breaker with earth-leakage 6 A 30 mA Type A, phase B', 'Watchman room: 2 lights, fan, TV'],
        ['7', 'Daylight sensor + timer', 'Common lights'],
      ],
    },
    {
      id: 'floor-isolator', name: 'Floor emergency isolators (two per floor, 12 total)', where: 'Electrical room riser cupboard, on the grid riser and the backup riser, just before each floor\u2019s two private meters', fedFrom: 'grid riser from the grid main or solar main panel, and backup riser from the backup main board',
      ways: [
        ['Grid switch', '4-pole isolator 40 A, red handle', 'Kills that floor\u2019s grid board only. A single 4-pole switch cannot open both 4-core feeders.'],
        ['Backup switch', '4-pole isolator 20 A, red handle, beside the grid switch', 'Kills that floor\u2019s backup board only. Lift and other floors stay live.'],
        ['Hasp', 'One padlock hasp through both handles', 'The floor is dead only when both handles are OFF and the padlock is on. Label both switches. Do not link them with a homemade bar.'],
      ],
    },
    {
      id: 'home-grid', name: 'Home grid board (each home): appliances, no backup', where: 'Inside each home, near the entrance. 3-phase 8-way board (24 single-pole slots). Phases shown are for Floor 1; rotate them for other floors (table below). The penthouse uses the same board with 2 air conditioners and 1 geyser', fedFrom: 'the grid private meter (3-phase)', circuits: 'grid',
      ways: [
        ['Main switch', '4-pole isolator 40 A + 4-pole earth-leakage breaker 40 A 30 mA Type A', ''],
        ['Surge protector', 'Type 2, with the maker backup breaker', ''],
        ['Voltage relay', 'Over/under-voltage relay, window about 180-275 V, restart delay 3 minutes', 'Broken-neutral protection. Do not set the high trip at 250 V; night voltage here is often 250-270 V.'],
      ],
    },
    {
      id: 'home-backup', name: 'Home backup board (each home)', where: 'Inside each home, next to the grid board, in a different colour', fedFrom: 'the backup private meter (3-phase, with load-limit relay)', circuits: 'backup',
      ways: [
        ['Main switch', '4-pole earth-leakage breaker 25 A 30 mA Type A', ''],
        ['Limit', '3-phase meter plus 4-pole contactor, total 1.5 kW (Penthouse 1.0 kW), and 3 A breaker per phase (2 A in the penthouse)', 'Commission on day 1, before the inverter arrives. 3 A sockets only, not 6/16 A universal sockets. Work-socket phase rotates with the floor so empty floors cannot pile one phase.'],
      ],
    },
  ];

  const CABLES = [
    ['Meter 1 to grid main panel', '4-core 25 sq mm copper, armoured, full-size neutral. Bimetallic lugs if the TGSPDCL service is aluminium.', '5 m', 'Sized so Floor 2 can move to Meter 1. Do not use 3.5-core.'],
    ['Meter 2 to solar main panel', '4-core 35 sq mm copper, armoured, full-size neutral. Bimetallic lugs if the service is aluminium.', '5 m', 'Meter 2 carries the inverter plus Floors 2-4 plus pumps. Export sensor on this incomer.'],
    ['Grid main panel circuit 1 and solar main panel circuit 6 to the Floor 1 transfer switch', '4-core 10 sq mm copper + earth wire', '4 m each', 'Circuit 6, not circuit 7. Circuit 7 is the car charger.'],
    ['Grid main panel circuit 4 and solar main panel circuit 2 to the Floor 2 transfer switch', '4-core 10 sq mm copper + earth wire', '3 m each', ''],
    ['Grid main panel circuit 3 and solar main panel circuit 8 to the pump transfer switch', '4-core 4 sq mm copper + earth wire', '3 m each', ''],
    ['Grid main panel circuit 6 to the bus-tie breaker to the solar main panel busbar', '4-core 70 sq mm copper, armoured, full-size neutral + earth wire', '3 m', 'Sized for the one-meter expected peak (about 95 A), not for every appliance at once. Not 25 sq mm.'],
    ['Solar main panel circuit 1 to PuREPower grid input', '4-core 10 sq mm copper + earth wire', '5 m', ''],
    ['PuREPower output to bypass switch position I', '4-core 10 sq mm copper + earth wire', '5 m', ''],
    ['Bypass switch to backup main board', '4-core 16 sq mm copper + earth wire', '3 m', ''],
    ['Solar main panel circuit 7 to the car charger outlet', '4-core 6 sq mm copper + earth wire', '5-15 m (parking location)', 'After Meter 2, before the inverter. Dedicated circuit, no other load shares it (IS 17017). Not on the backup board.'],
    ['Each floor: grid riser to grid isolator to grid meter; backup riser to backup isolator to backup meter', '4-core 10 sq mm (grid) and 4-core 2.5/4 sq mm (backup), short jumpers', '0.5 m each, 6 floors', 'Two switches, one hasp. Not one 4-pole switch on both feeders.'],
    ['Grid supply to Floors 1-4 and Penthouse', '4-core 10 sq mm copper, armoured + 6 sq mm earth wire', '20-33 m each, about 135 m in total', 'Voltage drop under 1 % at 32 A'],
    ['Backup supply to Floors 1-3', '4-core 2.5 sq mm copper + 2.5 sq mm earth wire', '20-26 m each', ''],
    ['Backup supply to Floor 4 and Penthouse', '4-core 4 sq mm copper + 4 sq mm earth wire', '29-33 m each', 'Voltage drop under 1.5 %'],
    ['Lift supply', '4-core 10 sq mm copper + earth wire (confirm with lift vendor)', 'about 35 m', 'To the controller at the top landing'],
    ['Ground-floor pumps', '4-core 4 sq mm copper + earth wire', 'about 15 m', ''],
    ['Inside homes, grid board', 'Air conditioners, geysers, induction, microwave, washing machine, kitchen and power sockets 4 sq mm; fridge 2.5 sq mm on a 10 A breaker (copper, fire-resistant)', 'per home layout', 'One circuit per heavy appliance. 4 sq mm survives a hot grouped conduit and a later 3 kW geyser.'],
    ['Inside homes, backup board', 'Fans, lights, TV, router and the 3 A work socket 1.5 sq mm (copper, fire-resistant)', 'per home layout', 'Own conduit. 3 A sockets only, not universal 6/16 A sockets.'],
    ['Solar strings (3)', 'Single-core 6 sq mm solar cable, red + black, in the cable duct, never in the lift shaft', '3 x 2 x about 40 m', 'Half-cut panels. Factory connectors only, no MC4 adapters. No string shaded by the penthouse or the water tank.'],
    ['Meter data', 'Shielded twisted-pair data cable', 'about 20 m', 'Loops through every private meter'],
    ['Signal wires', '6-core 1 sq mm control cable', 'about 40 m', 'PuREPower signal contacts to the load-shedding switch and the lift controller'],
  ];

  const EARTH = [
    ['1, 2', 'Building', 'Main earth bar: all boards, sockets, appliances, meters'],
    ['3, 4', 'Solar and inverter body', 'Panel frames, steel frame, roof junction box, PuREPower cabinet'],
    ['5 (and 6)', 'Inverter neutral', 'Only if the PuREPower switches the neutral in a power cut (neutral-earth link)'],
    ['7, 8', 'Lift', 'Lift rules: separate earth; bond guide rails and machine'],
    ['9, 10', 'Lightning', 'Down-conductors; joined to the main earth below ground through a test link'],
  ];

  const LIFT_PROTECTION = [
    ['Lift drive that does not feed power back (non-regenerative), with a braking resistor', 'Lift vendor', 'Burns the braking energy in a resistor, so nothing flows back into the PuREPower. Write it into the purchase order.'],
    ['Reverse-power relay on the lift supply', 'Electrician', 'Only if the drive does feed power back. Trips or blocks it when the inverter is on battery.'],
    ['Phase-sequence and phase-failure relay', 'Lift vendor / electrician', 'Stops the lift if the R-Y-B order is wrong after bypass, an inverter change or rewiring. Prevents the motor running backwards.'],
    ['High/low-voltage relay', 'Lift vendor', 'Usually inside the controller; confirm.'],
    ['4-pole circuit breaker 32 A (curve to suit the drive) + lockable isolator at the controller', 'Electrician', 'Short-circuit protection and safe isolation.'],
    ['Type B earth-leakage device 300 mA, or an adjustable earth-leakage relay', 'Electrician', 'Lift drives leak smooth DC current that ordinary Type A devices miss.'],
    ['Surge protector Type 2 at the lift controller', 'Electrician', 'Protects the drive electronics.'],
    ['Input choke / harmonic filter on the drive', 'Lift vendor', 'Reduces electrical stress on the inverter.'],
    ['No power-factor capacitor on the lift supply', 'Electrician', 'Capacitors can resonate with the inverter output.'],
    ['Automatic rescue device with its own battery', 'Lift vendor', 'Brings the car to a floor if both grid and inverter fail.'],
    ['Acceleration power cap, and a contactor that drops the lift before the inverter current limit', 'Lift vendor / electrician', 'A lift start must not trip the only inverter and black out the lights. Cap acceleration power in the drive. Energy-saving speed whenever the supply is the inverter, not only below 20 %.'],
    ['Interface relays for the PuREPower signal contacts', 'Electrician', '"On battery" = energy-saving mode. "Battery under 20 %" = park at the nearest floor, doors open, lock out.'],
    ['Separate earth (2 pits) and bonding', 'Electrician', 'Guide rails, machine, controller.'],
  ];

  const TESTS = [
    'Insulation test (megger, 500 V / 1000 V) on every cable before switching on.',
    'Earth resistance of each pit (5 ohm or less) and of the joined system (1 ohm or less).',
    'Phase sequence: R-Y-B at bypass position II must match R-Y-B at position I (PuREPower output). Check before the lift is connected.',
    'Earth-leakage trip tests: every 30 mA device and the 300 mA time-delayed breaker.',
    'Full-load test in one home: run all air conditioners, the induction cooktop and one geyser together. No breaker trips, and the voltage at the grid board stays above 216 V.',
    'Floor 2 transfer switch: with the Floor 2 grid meter off, move it I-0-II and back; confirm it breaks before it makes and both meters read correctly afterwards.',
    'Floor 1 transfer switch: same test as the Floor 2 switch, on the Floor 1 grid meter.',
    'Bus-tie trapped key: with both meter breakers ON, confirm the tie physically will not close. Lock one meter breaker OFF, remove phase and neutral of that meter on a dead test, and only then prove the tie can close. Do not close it on a live pair of meters.',
    'Floor emergency isolators: at each floor, open the grid switch only and confirm the backup board stays live; open the backup switch only and confirm the grid board stays live; padlock both OFF and confirm that floor is dead while every other floor, the lift and common areas stay live.',
    'Car charger: Type B earth-leakage trip on a simulated DC fault. In a power-cut test the charger goes dead with Meter 2, and the backup bus stays up. The charger cable is on solar main panel circuit 7, not on the backup board.',
    'Power-cut test, two ways: open the solar main panel main switch, then also kill the supply while the lift is moving. Backup boards must not blink. The lift must ride through or park, not fault. Meter 2 goes dead within 2 seconds. Repeat with the bypass lamp check: lamp ON only on position II.',
    'Export sensor: confirm the current transformer is on the Meter 2 incomer. Before the net meter, Meter 2 must not run backwards.',
    'Neutral-earth: do not energise backup earth-leakage devices until PuREnergy confirms in writing whether the inverter opens the neutral in a cut, and that any neutral-earth link is inside the inverter and only in island mode.',
    'Load-limit test, day 1: a 1.6 kW heater on a backup socket trips the contactor; it reconnects after 1-2 minutes. A 1 kW load on one phase holds only if that phase is under 3 A, otherwise the 3 A breaker opens.',
    'Signal-contact tests: simulate battery under 30 % (load-shedding switch opens) and under 20 % (lift parks).',
    'Solar strings: polarity, open-circuit voltage under 450 V, short-circuit current under 27 A per solar input.',
    'Labels and schedules fixed on every board; "two supplies" warning on the backup main board and every backup board.',
  ];

  const BOM = [
    { group: 'Roof and solar', items: [
      ['Solar panels, Made-in-India cells, half-cut, on the government approved list, about 575 W each', '24 (about 14 kW), 3 strings of 8', '3.4-4.4 lakh'],
      ['Raised hot-dip galvanised steel frame, 2.1-2.5 m clear, designed for wind load (Indian Standard 875 part 3)', '1 set', '1.0-1.8 lakh'],
      ['Roof junction box: 3 x 2-pole solar isolators 1000 V 32 A + surge protector Type 2, weatherproof', '1', 'in solar cable set'],
      ['Single-core 6 sq mm solar cable, red/black + solar plug connectors', 'about 240 m + 10 pairs', 'in solar cable set'],
      ['Fire-rated conduit / tray for the solar cable riser', 'about 40 m', 'in solar cable set'],
      ['Solar isolator + surge protector at the inverter', '1 each', '0.52-0.81 lakh (solar cable set)'],
      ['Lightning rod(s) + down-conductors (after a lightning risk check)', '1 set', 'building scope'],
    ] },
    { group: 'Inverter', items: [
      ['PuREPower Home 20.0, 20 kVA / 20 kWh, grid export enabled', '1', '5.5 lakh (quote)'],
      ['Concrete plinth 300 mm, anchors, ventilation fan, smoke detector', '1 set', 'civil'],
      ['Solar installation and commissioning', '1', '0.36-0.6 lakh'],
      ['Net-meter application, two-way meter, drawings', '1', '0.15-0.3 lakh'],
    ] },
    { group: 'Electrical room', items: [
      ['Grid main panel, as schedule', '1', '0.35-0.6 lakh'],
      ['Solar main panel, as schedule, including the lockable solar isolator', '1', '0.45-0.75 lakh'],
      ['Bus-tie breaker, 4-pole 160 A, trapped-key interlock, 70 sq mm tie (2.10)', '1', '1.0-1.6 lakh'],
      ['Bypass switch 4-pole 63 A I-0-II', '1', 'in backup main board'],
      ['Backup main board, as schedule, including the load-shedding switch, lift-shed contactor and outage dump contactor', '1', '0.5-0.9 lakh'],
      ['Pump feeder transfer switch, 4-pole 20 A I-0-II', '1', '0.08-0.15 lakh'],
      ['Floor 2 transfer switch 4-pole 40 A I-0-II (lets Floor 2 sit on either meter)', '1', '0.04-0.08 lakh (in solar main panel)'],
      ['Floor 1 transfer switch 4-pole 40 A I-0-II (standard; also clears an empty-floor surplus)', '1', '0.04-0.08 lakh'],
    ] },
    { group: 'Private meters (two per floor)', items: [
      ['3-phase grid meter, accuracy class 1, with data port', '6', '0.27-0.48 lakh'],
      ['3-phase backup meter with load-limit relay, accuracy class 1, with data port', '6', '0.30-0.54 lakh'],
      ['Meter-reading box (data logger)', '1', '0.08-0.15 lakh'],
    ] },
    { group: 'Floors', items: [
      ['Home grid board, 3-phase 8-way, as schedule (12 appliance circuits)', '5 + Ground pumps board', 'building scope'],
      ['Floor emergency isolators, 4-pole, red handle, two per floor with one padlock hasp', '12', '0.24-0.48 lakh'],
      ['Isolator next to each air conditioner outdoor unit, 2-pole 32 A, weatherproof', '14 (3 per home, 2 in the penthouse)', 'building scope'],
      ['Home backup board, 3-phase 4-way, different colour, as schedule', '5 + Ground backup board', '0.36-0.6 lakh'],
      ['3 A work sockets, not universal 6/16 A, and coloured backup switch plates', '5 sets', 'building scope'],
      ['Energy-saving fans on backup circuits', '19', 'owner choice'],
    ] },
    { group: 'Cables', items: [
      ['Backup risers 4-core 2.5/4 sq mm copper + earth wire', 'about 135 m', '0.26-0.44 lakh'],
      ['Grid risers 4-core 10 sq mm copper, armoured + earth wire', 'about 135 m', 'building scope'],
      ['Lift supply 4-core 10 sq mm copper + earth wire', 'about 35 m', 'building scope'],
      ['Meter data cable + 6-core control cable', 'about 60 m', 'in private meters'],
    ] },
    { group: 'Earthing', items: [
      ['Maintenance-free earth pits, 3 m deep', '10 (4 extra for solar and inverter)', '0.24-0.48 lakh (extras)'],
      ['Main earth bar, test links, 25 x 3 mm copper strip / 16 sq mm copper wire', '1 set', 'building scope'],
    ] },
    { group: 'Lift interface', items: [
      ['Phase-sequence relay, surge protector Type 2, Type B earth-leakage device or relay, interface relays', '1 set', '0.08-0.2 lakh'],
    ] },
    { group: 'Labels and safety', items: [
      ['Board schedules, "SOLAR CABLE LIVE IN DAYLIGHT" and "TWO SUPPLIES" warnings, phase tapes', '1 set', 'small'],
      ['Carbon-dioxide and dry-powder fire extinguishers at the electrical room', '2', 'small'],
    ] },
  ];

  /* Suggested real switchgear for Hyderabad/India sourcing (IndiaMART, local Schneider/L&T/
     Legrand/Havells distributors, e.g. Begumpet/Abids electrical markets). Representative
     well-known product families and indicative street prices, Oct 2026 - a licensed electrical
     contractor should confirm exact model, availability and price with a local supplier before
     ordering; nothing here is a quote. */
  const PARTS = [
    { group: 'Main incomers and isolators', items: [
      ['Grid/solar main panel incomer', '4-pole MCCB 160 A, adjustable, 25 kA', 'Schneider Easypact MCCB / L&T DN1 or similar', 'IS/IEC 60947-2', '\u20b98,000-14,000'],
      ['Bus-tie breaker (2.10)', '4-pole MCCB 160 A plus trapped-key interlock. Not a changeover.', 'Schneider / L&T MCCB with Castell or equivalent key box', 'IS/IEC 60947-2', '\u20b918,000-35,000'],
      ['Floor 1 / Floor 2 transfer switches, bypass switch', '4-pole on-load changeover 40-63 A', 'L&T C-Line CO1-63/CO1-40 or Salzer equivalent', 'IS/IEC 60947-3', '\u20b93,500-6,500 each'],
      ['Floor emergency isolators (two per floor)', '4-pole isolator 40 A (grid) and 20 A (backup), red handle, common padlock hasp', 'Legrand Vistop / Havells / Schneider equivalent', 'IS/IEC 60947-3', '\u20b9800-1,600 each'],
      ['Solar isolator (roof + inverter input)', '2-pole DC isolator 1000 V 32 A, weatherproof', 'Schneider Solar isolator / Polycab equivalent', 'IEC 60947-3 (DC)', '\u20b91,200-2,200 each'],
    ] },
    { group: 'MCBs (final circuits, C curve unless noted)', items: [
      ['Grid board appliance circuits', 'Single/double-pole MCB 16-20 A, 10 kA', 'Schneider Acti9 iC60N / Legrand DX3 / Havells equivalent', 'IS 8828 / IEC 60898-1', '\u20b9150-400 each'],
      ['Air conditioner circuits', 'Single-pole MCB 20 A, 10 kA', 'Schneider Acti9 iC60N or equivalent', 'IS 8828', '\u20b9180-350 each'],
      ['Backup board circuits (per floor)', '4-pole MCB 10 A, 6-10 kA', 'Schneider Acti9 iC60N 4P or equivalent', 'IS 8828 / IEC 60898-1', '\u20b9700-1,100 each'],
      ['Car charger circuit', 'Single-pole MCB 32 A, C curve, 10 kA', 'Schneider Acti9 iC60N or equivalent', 'IS 8828', '\u20b9350-600'],
      ['Lift supply', 'Triple/4-pole MCB 32 A (curve per lift vendor)', 'Schneider/L&T as lift vendor specifies', 'IS 8828 / IEC 60947-2', '\u20b91,200-2,200'],
    ] },
    { group: 'Earth-leakage protection', items: [
      ['Home grid/backup board main switch', '4-pole RCBO or MCB+RCCB, 30-40 A, 30 mA, Type A', 'Legrand DX3 / Schneider Acti9 Vigi or equivalent', 'IS 12640 / IEC 61009-1', '\u20b92,500-5,000'],
      ['Backup main board circuit 2 (group protection)', '4-pole RCCB 63 A, 300 mA, time-delayed (Type S)', 'Legrand DX3 / Schneider Vigi iC60 or equivalent', 'IS 12640 / IEC 61008-1', '\u20b93,000-5,500'],
      ['Car charger circuit (solar main panel, before the inverter)', '4-pole RCCB/RCBO 32-40 A, 30 mA, Type B (detects DC fault current)', 'Legrand DX3-ID Type B / Siemens 5SV3 Type B / ABB F200 Type B', 'IEC 62423 / IS 17017 Annexure', '\u20b98,000-16,000'],
      ['Lift controller', 'Type B earth-leakage device or adjustable earth-leakage relay, 300 mA', 'Siemens 5SV3 Type B or lift vendor\u2019s own relay', 'IEC 62423', '\u20b96,000-12,000'],
      ['Common-area lighting circuits', 'Single-pole RCBO 6 A, 30 mA, Type A', 'Legrand/Havells equivalent', 'IS 8828 + IS 12640', '\u20b91,200-2,000'],
    ] },
    { group: 'Surge protection', items: [
      ['Grid/solar main panel', 'Type 1+2 SPD, 4-pole, with remote signalling contact', 'Schneider iQuick PRD / Legrand equivalent', 'IEC 61643-11', '\u20b96,000-11,000'],
      ['Backup main board, home boards, lift controller', 'Type 2 SPD, 4-pole, 40 kA', 'Schneider iQuick PRD / Legrand equivalent', 'IEC 61643-11', '\u20b93,000-6,000'],
    ] },
    { group: 'Metering', items: [
      ['Private grid/backup meters (per floor)', '3-phase whole-current meter, class 1.0, RS-485/Modbus data port', 'Secure Meters / L&T / HPL / Genus (TGSPDCL-approved type)', 'IS 16444 (CBIP approved)', '\u20b92,500-4,500 each'],
      ['TGSPDCL net meter (Meter 1 and Meter 2)', '3-phase bi-directional net meter', 'As allotted by TGSPDCL on application', 'TSERC net-metering regulation', 'TGSPDCL fee, not owner-purchased'],
    ] },
    { group: 'EV charger (if fitted)', items: [
      ['AC charger, dedicated circuit', '7.4 kW (32 A) or 3.3 kW (16 A) Type 2 / Bharat AC-001 socket, Mode 3', 'Any IS 17017-compliant AC charger (e.g. Exicom, Servotech, Delta)', 'IS 17017 Part 1 / IEC 61851-1', '\u20b915,000-35,000'],
    ] },
  ];

  const ROOM = [
    'About 2.5 m x 2 m on the ground floor, next to the TGSPDCL meters. Not a west wall.',
    'Floor-standing frame on a plinth above the known flood level. Do not hang the 150 kg inverter on a 115 mm brick wall.',
    'Inlet and exhaust to outside, plus a temperature alarm. A fan that only stirs 42 \u00b0C air does not cool the battery. Hold the summer float near 90 %, not 100 %.',
    'Smoke detector inside; carbon-dioxide extinguisher for the electrical gear. Do not store anything in the room.',
    '1 m clear in front of the PuREPower and every panel.',
    'Not under the staircase and not on the escape route. Door swings out.',
  ];

  // Plain name on this site -> what shops, drawings and vendors call it.
  const GLOSSARY = [
    ['Circuit breaker', 'MCB (miniature circuit breaker)'],
    ['Moulded-case breaker', 'MCCB (moulded-case circuit breaker)'],
    ['Earth-leakage breaker', 'RCCB (residual-current circuit breaker)'],
    ['Breaker with earth-leakage', 'RCBO (breaker and earth-leakage in one)'],
    ['Type B earth-leakage device', 'Type B RCD (needed for lift drives)'],
    ['Surge protector', 'SPD (surge protection device)'],
    ['Load-shedding switch', 'Contactor driven by the inverter'],
    ['Transfer switch, bypass switch', 'Changeover switch, I-0-II, 4-pole'],
    ['Signal contact', 'Dry contact (potential-free relay output)'],
    ['Meter with data port', 'Meter with RS485 / Modbus output'],
    ['Solar plug connectors', 'MC4 connectors'],
    ['Made-in-India panels', 'DCR panels (domestic content requirement), on the government approved list (ALMM); needed for the subsidy'],
    ['Variable-speed lift drive', 'VVVF drive (variable voltage, variable frequency)'],
    ['Automatic rescue device', 'ARD'],
    ['Energy-saving fans', 'BLDC fans (brushless motor)'],
    ['Grid main panel / solar main panel / backup main board', 'Main LT (low-tension) panels; the backup main board is also called the essential or UPS board'],
  ];

  return { BOARDS, CABLES, EARTH, LIFT_PROTECTION, TESTS, BOM, PARTS, ROOM, GLOSSARY };
});
