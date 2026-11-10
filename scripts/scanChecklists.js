/**
 * Scan checklist content: the planning-scan checklists for each treatment
 * site, the final checks and the patient and scan details, typed in from the
 * departmental "Radiotherapy planning scan – Scanner checklist" document.
 *
 * Wording, including each Escalate warning, is kept exactly as in that
 * document. Only Breast, Head and neck and Pelvis have an Escalate warning
 * there, so the other sites have none (escalate: null).
 *
 * Changing wording: edit it here and bump CHECKLIST_VERSION. Completed sheets
 * keep a copy of the wording they were completed with (see checklistState.js),
 * so their checklist never changes. Item ids only need to be unique; never
 * reuse an old id for a different item.
 */

export const CHECKLIST_VERSION = 1;

/* Sites in the order they are offered. `items` are [check, item to confirm]. */
const SITES = [
  {
    id: "breast",
    name: "Breast",
    subtitle: "Breast planning scans",
    sided: true, /* Left / Right is chosen with the site. */
    escalate: "Unhealed wounds, restricted arm movement, inability to tolerate positioning, uncertainty about scar wiring or inability to perform required DIBH. Contact the treating radiation oncologist.",
    prefix: "br",
    items: [
      ["Checklist", "Confirm left or right breast and treatment prescription"],
      ["Checklist", "Review surgical history: lumpectomy, mastectomy or other surgery"],
      ["Patient preparation", "Explain procedure and positioning to patient"],
      ["Patient comfort", "Is patient comfortable lying in the required position?"],
      ["Arm mobility", "Can patient lift and maintain both arms above head?"],
      ["Surgery", "Check for restricted shoulder movement or discomfort following surgery"],
      ["Wounds", "Are surgical wounds healed? Check scars covered by tape or dressings without removing them"],
      ["Scar wiring", "Identify lumpectomy and mastectomy scars requiring wires"],
      ["Scar wiring", "Wire relevant borders or additional scars if requested by doctor"],
      ["DIBH – left breast", "Confirm whether DIBH is required"],
      ["DIBH – left breast", "Explain and practise breathing instructions"],
      ["DIBH – left breast", "Can patient perform a reproducible breath hold?"],
      ["Positioning", "Confirm correct breast board and immobilisation setup"],
      ["Scan", "Confirm scan extent and required protocol"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
      ["Documentation", "Record any positioning difficulties or deviations"],
    ],
  },
  {
    id: "head_and_neck",
    name: "Head and neck",
    subtitle: "Head and neck planning scans",
    escalate: "Poor mask fit, inability to tolerate immobilisation, unclear contrast requirements, missing bolus instructions or uncertainty regarding scar wiring.",
    prefix: "hn",
    items: [
      ["Checklist", "Confirm treatment site and prescription"],
      ["Checklist", "Confirm mask type and immobilisation requirements"],
      ["Checklist", "Is contrast required?"],
      ["Checklist", "Is a bite block required?"],
      ["Checklist", "Are scars to be wired?"],
      ["Checklist", "Is bolus required?"],
      ["Patient preparation", "Explain mask-making procedure to patient"],
      ["Patient preparation", "Explain the importance of remaining still"],
      ["Dentures", "Remove dentures where required by the treatment protocol"],
      ["Positioning", "Confirm correct head, neck and shoulder position"],
      ["Mask", "Make appropriate thermoplastic mask"],
      ["Mask", "Check mask fit, stability and patient comfort"],
      ["Mask", "Confirm reproducible immobilisation"],
      ["Bite block", "Make and fit bite block where required"],
      ["Bite block", "Check comfort and reproducibility"],
      ["Scar wiring", "Wire relevant scars according to instructions"],
      ["Contrast", "Confirm appropriate contrast preparation and procedure"],
      ["Bolus", "Make bolus according to prescribed requirements"],
      ["Bolus", "Record bolus templates and dimensions"],
      ["Bolus", "Take photographs of bolus placement"],
      ["Scan", "Confirm scan extent and protocol"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
      ["Documentation", "Save mask, bite block and bolus information as required"],
    ],
  },
  {
    id: "pelvis",
    name: "Pelvis",
    subtitle: "Pelvic planning scans",
    escalate: "Inadequate or excessive bladder filling, significant rectal distension, unexpected bowel anatomy or preparation that does not meet the prescribed requirements.",
    prefix: "pv",
    items: [
      ["Checklist", "Confirm treatment site and prescription"],
      ["Checklist", "Confirm full or empty bladder protocol"],
      ["Checklist", "Review diagnostic imaging and preparation requirements"],
      ["Checklist", "Check bowel and rectal preparation instructions"],
      ["Patient preparation", "Explain bladder preparation requirements"],
      ["Bladder", "Has patient followed the prescribed bladder protocol?"],
      ["Bladder", "Assess bladder filling on planning scan"],
      ["Bladder", "Is filling consistent with the requested protocol?"],
      ["Rectum", "Assess rectal filling and distension"],
      ["Rectum", "Check for excessive rectal contents or gas"],
      ["Bowel", "Assess bowel position and distribution"],
      ["Reproducibility", "Consider whether bladder, rectum and bowel anatomy can be reproduced during daily CBCT"],
      ["Positioning", "Confirm correct and reproducible patient positioning"],
      ["Scan", "Confirm scan extent and protocol"],
      ["Documentation", "Record bladder preparation and any deviations"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
    ],
  },
  {
    id: "sbrt_pancreas",
    name: "SBRT – Pancreas",
    subtitle: "SBRT planning scans",
    escalate: null,
    prefix: "pa",
    items: [
      ["Checklist", "Confirm pancreas SBRT prescription"],
      ["Checklist", "Confirm immobilisation requirements"],
      ["Checklist", "Confirm whether DIBH or another motion-management technique is required"],
      ["Checklist", "Confirm contrast requirements"],
      ["Patient preparation", "Explain procedure and importance of remaining still"],
      ["Positioning", "Assess patient comfort and ability to maintain position"],
      ["Immobilisation", "Select and fit prescribed immobilisation equipment"],
      ["DIBH", "Explain and practise breathing instructions if required"],
      ["DIBH", "Assess ability to perform reproducible breath holds"],
      ["Scan", "Confirm prescribed respiratory and imaging protocol"],
      ["Scan", "Confirm scan extent"],
      ["Documentation", "Record immobilisation and breathing technique"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
    ],
  },
  {
    id: "sbrt_liver",
    name: "SBRT – Liver",
    subtitle: "",
    escalate: null,
    prefix: "li",
    items: [
      ["Checklist", "Confirm liver SBRT prescription"],
      ["Checklist", "Confirm immobilisation requirements"],
      ["Checklist", "Confirm DIBH or respiratory motion-management requirements"],
      ["Checklist", "Confirm contrast requirements"],
      ["Patient preparation", "Explain procedure and breathing instructions"],
      ["Positioning", "Assess patient comfort and positioning tolerance"],
      ["Immobilisation", "Fit prescribed immobilisation equipment"],
      ["DIBH", "Practise breathing technique if required"],
      ["DIBH", "Assess reproducibility of breath hold"],
      ["Scan", "Confirm respiratory management protocol"],
      ["Scan", "Confirm scan extent"],
      ["Documentation", "Record immobilisation and breathing technique"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
    ],
  },
  {
    id: "sbrt_lung",
    name: "SBRT – Lung",
    subtitle: "",
    escalate: null,
    prefix: "lu",
    items: [
      ["Checklist", "Confirm lung SBRT prescription and treatment side"],
      ["Checklist", "Confirm immobilisation requirements"],
      ["Checklist", "Confirm DIBH, free-breathing or other motion-management technique"],
      ["Checklist", "Confirm contrast requirements"],
      ["Patient preparation", "Explain procedure and breathing instructions"],
      ["Positioning", "Assess patient comfort and ability to maintain position"],
      ["Immobilisation", "Fit prescribed immobilisation equipment"],
      ["Breathing", "Practise prescribed breathing technique"],
      ["Breathing", "Assess patient ability to reproduce the required breathing pattern"],
      ["Scan", "Confirm prescribed respiratory management and imaging protocol"],
      ["Scan", "Confirm scan extent"],
      ["Documentation", "Record immobilisation and breathing technique"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
    ],
  },
  {
    id: "sbrt_para_aortic",
    name: "SBRT – Para-aortic lymph nodes",
    subtitle: "",
    escalate: null,
    prefix: "pn",
    items: [
      ["Checklist", "Confirm para-aortic treatment site and prescription"],
      ["Checklist", "Confirm immobilisation requirements"],
      ["Checklist", "Confirm whether DIBH is required"],
      ["Checklist", "Confirm contrast requirements"],
      ["Patient preparation", "Explain procedure and breathing instructions"],
      ["Positioning", "Assess comfort and positioning tolerance"],
      ["Immobilisation", "Fit prescribed immobilisation equipment"],
      ["DIBH", "Practise breathing instructions if required"],
      ["DIBH", "Assess reproducibility of breath hold"],
      ["Scan", "Confirm prescribed motion-management protocol"],
      ["Scan", "Confirm scan extent"],
      ["Documentation", "Record immobilisation and breathing technique"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
    ],
  },
  {
    id: "cranial_srs",
    name: "Cranial SRS",
    subtitle: "Stereotactic cranial planning scans",
    escalate: null,
    prefix: "cr",
    items: [
      ["Checklist", "Confirm cranial SRS prescription"],
      ["Checklist", "Confirm stereotactic mask requirements"],
      ["Checklist", "Has the doctor booked a new MRI?"],
      ["Checklist", "Confirm MRI availability and imaging requirements"],
      ["Patient preparation", "Explain mask-making procedure"],
      ["Patient preparation", "Explain the importance of remaining still"],
      ["Positioning", "Confirm correct head positioning"],
      ["Mask", "Make stereotactic mask"],
      ["Mask", "Check mask fit and stability"],
      ["Mask", "Confirm patient comfort and ability to tolerate mask"],
      ["Scan", "Confirm prescribed scan protocol and extent"],
      ["Documentation", "Complete electronic scan sheet and landmarks"],
      ["Documentation", "Record MRI arrangements and any outstanding imaging requirements"],
    ],
  },
  {
    /* Not in the document: for scans that match none of the sites above. */
    id: "other",
    name: "Other / general",
    subtitle: "Patient and scan details and final checks only",
    escalate: null,
    prefix: "ot",
    items: [],
  },
];

/* Site definitions with item ids filled in: { id, check, text }. */
export const CHECKLIST_SITES = SITES.map((s) => ({
  id: s.id,
  name: s.name,
  subtitle: s.subtitle || "",
  sided: !!s.sided,
  escalate: s.escalate || null,
  items: s.items.map(([check, text], i) => ({ id: `${s.prefix}-${i + 1}`, check, text })),
}));

export const SITE_SIDES = ["Left", "Right"];

export const FINAL_CHECKS = {
  title: "Final checks – All treatment sites",
  subtitle: "This section should be completed before the patient leaves the scanning department.",
  columnTitle: "Final verification",
  items: [
    "Correct patient and treatment site confirmed",
    "Electronic checklist reviewed and requirements followed",
    "Correct immobilisation used",
    "Patient positioned comfortably and reproducibly",
    "Required wires and markers placed",
    "Required bolus made, recorded and photographed",
    "Contrast requirements addressed",
    "Scan extent and protocol checked",
    "Required anatomical landmarks taken",
    "Electronic scan sheet completed correctly",
    "Any deviations or difficulties documented",
    "Outstanding queries referred to treating radiation oncologist",
  ].map((text, i) => ({ id: `fc-${i + 1}`, text })),
};

/* Labels of the patient and scan details, as in the document. */
export const DETAIL_LABELS = {
  patient: "Patient name / ID",
  site: "Treatment site",
  oncologist: "Treating radiation oncologist",
  scanDate: "Date of planning scan",
  performedBy: "Person performing scan",
  reviewedBy: "Checklist reviewed by",
  comments: "Outstanding queries / comments",
};

export const IMPORTANT_NOTE = "This is a training and operational reference checklist. The treating radiation oncologist's prescription, approved departmental protocols and applicable contrast-safety procedures take precedence. Staff should not independently change preparation, contrast, immobilisation or motion-management requirements.";

export function getChecklistSite(siteId) {
  return CHECKLIST_SITES.find((s) => s.id === siteId) || null;
}
