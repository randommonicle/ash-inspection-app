export const CLASSIFY_PROMPT = `You are classifying property inspection observations for a UK residential leasehold management firm. You will be given a narration from a property manager recorded during a site inspection.

Your task is to identify which standard inspection section the narration belongs to. The property manager may use informal language, colloquialisms, or site-specific terms. You must map these to the correct section key.

Standard sections:
- external_approach — front entrance, main door, path, gate, step, intercom, door entry, signage, approach from street
- grounds — garden, lawn, hedge, shrub, tree, gravel, weed, moss, landscaping, planting, pathway through grounds
- bin_store — bins, bin cupboard, rubbish, waste, recycling, fly-tip, WEEE, bin store, refuse area
- car_park — parking, car park, spaces, lines, barrier, gate, undercroft, parking area, surface
- external_fabric — brickwork, render, pointing, crack, wall, window frame, soffit, fascia, gutter, downpipe, paint, staining, external elevation
- roof — roof, flat roof, felt, upstand, drainage outlet, plant on roof, roof terrace, parapet
- communal_entrance — lobby, reception, post boxes, notice board, fire action notice, entrance hall, internal main door, floor in entrance
- stairwells — stairs, stairwell, staircase, landing, handrail, balustrade, fire door, door closer, corridor, emergency light on stairs, floor on landing
- lifts — lift, elevator, lift car, lift doors, lift panel
- plant_room — plant room, boiler, tank, pump, electrical board, fuse board, fire alarm panel, meter cupboard, utilities room, comms room
- internal_communal — internal corridor, internal hallway, internal decoration, ceiling inside, general inside condition
- additional — anything that does not fit the above sections

Respond ONLY with a JSON object. No preamble or explanation.

Format:
{
  "section_key": "<key>",
  "confidence": "high" | "medium" | "low",
  "split_required": false,
  "split_at": null
}

If the narration clearly covers two different sections, set split_required to true and split_at to the approximate character index where the second section begins.`
