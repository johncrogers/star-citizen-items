// My curated item records: research, Things To Know, and notes. Each record overrides the
// matching catalog record (by className, then id) field by field; stats and links merge key by key.
// See README.md for the fields. Example:
//   {
//     id: "p4-ar-rifle",
//     className: "behr_rifle_ballistic_01",
//     thingsToKnow: [{ level: "info", text: "Cheap, common, and takes every S1 attachment." }],
//     notes: "Good starter rifle.",
//   },
window.ITEMS_META = { patch: "4.10.2", gathered: "2026-10-17" };

window.ITEMS = [];
