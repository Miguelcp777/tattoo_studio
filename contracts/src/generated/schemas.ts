/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: contracts/schemas/
 * Regenerate: pnpm --filter @tattoo/contracts generate
 *
 * Editing this by hand fails the codegen reproducibility check.
 */

export const schemas: Record<string, Record<string, unknown>> = {
  'design': {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tattoo-creator.dev/schemas/design/1.0.0",
  "title": "Design",
  "description": "A generated artwork and its lineage. Produced by the flash engine from a TattooBrief, consumed by the stencil and mockup engines. Records the brief revision that produced it (CONTRACTS-INV-003). Follows the same conventions as TattooBrief: no 'format' keyword, and every pattern spells out [0-9], so TypeScript and Python reach identical verdicts.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "designId",
    "briefId",
    "briefRevision",
    "version",
    "kind",
    "status",
    "createdAt",
    "image",
    "provenance"
  ],
  "properties": {
    "schemaVersion": {
      "description": "Fixed for this schema revision (CONTRACTS-INV-004).",
      "const": "1.0.0"
    },
    "designId": {
      "$ref": "#/$defs/uuid"
    },
    "briefId": {
      "description": "The brief this design was rendered from.",
      "$ref": "#/$defs/uuid"
    },
    "briefRevision": {
      "description": "The exact brief revision used. A design is only meaningful against the revision that produced it (CONTRACTS-INV-003).",
      "type": "integer",
      "minimum": 1
    },
    "version": {
      "description": "Design version within its lineage. Refinement produces version n+1 and never mutates n (FLASH-INV-002).",
      "type": "integer",
      "minimum": 1
    },
    "parentDesignId": {
      "description": "The design this one was refined from. Absent on a first render.",
      "$ref": "#/$defs/uuid"
    },
    "kind": {
      "description": "Which pass produced this artwork. 'flash' is the shaded reference render; 'line_art' is the dedicated stencil pass, which is generated natively rather than edge-detected from flash (ADR-0003).",
      "enum": [
        "flash",
        "line_art"
      ]
    },
    "status": {
      "enum": [
        "draft",
        "accepted",
        "superseded"
      ]
    },
    "createdAt": {
      "$ref": "#/$defs/timestamp"
    },
    "image": {
      "$ref": "#/$defs/imageRef"
    },
    "provenance": {
      "description": "What produced this artwork. Kept so a design can be explained, reproduced and audited.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "provider",
        "model",
        "prompt"
      ],
      "properties": {
        "provider": {
          "description": "Adapter name, not a credential or endpoint.",
          "type": "string",
          "minLength": 1,
          "maxLength": 60
        },
        "model": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "prompt": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4000
        },
        "negativePrompt": {
          "type": "string",
          "maxLength": 2000
        },
        "seed": {
          "description": "Recorded when the provider exposes one, so a render can be reproduced.",
          "type": "integer",
          "minimum": 0
        }
      }
    }
  },
  "$defs": {
    "uuid": {
      "description": "Canonical lowercase UUID. A pattern rather than 'format', so both runtimes assert it.",
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "timestamp": {
      "description": "RFC 3339. ASCII digits only, so Python and JavaScript agree.",
      "type": "string",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$"
    },
    "imageRef": {
      "description": "A handle to stored image bytes. Bytes themselves never cross a module boundary or travel through the queue (JOBS-INV-001).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "storageKey",
        "mediaType",
        "widthPx",
        "heightPx"
      ],
      "properties": {
        "storageKey": {
          "description": "Opaque key into media storage. Never a signed or public URL (SEC-INV-008).",
          "type": "string",
          "minLength": 1,
          "maxLength": 512,
          "pattern": "^[A-Za-z0-9._/-]+$"
        },
        "mediaType": {
          "enum": [
            "image/png",
            "image/webp",
            "image/jpeg"
          ]
        },
        "widthPx": {
          "$ref": "#/$defs/pixels"
        },
        "heightPx": {
          "$ref": "#/$defs/pixels"
        },
        "byteSize": {
          "type": "integer",
          "minimum": 1
        }
      }
    },
    "pixels": {
      "description": "Raster dimensions of this stored image. These describe the artifact, not the tattoo: the tattoo's authoritative size is in millimetres on the brief, and nothing derives physical size from these (CONTRACTS-INV-001).",
      "type": "integer",
      "minimum": 1,
      "maximum": 16384
    }
  }
},
  'tattoo-brief': {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tattoo-creator.dev/schemas/tattoo-brief/1.0.0",
  "title": "TattooBrief",
  "description": "The system's central contract. The consultation produces it; the flash, stencil and mockup engines consume it. Size is authoritative in millimetres (CONTRACTS-INV-001) and style is drawn from a closed vocabulary (CONTRACTS-INV-002). No 'format' keyword is used and every pattern spells out [0-9], so that TypeScript and Python reach identical verdicts.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "briefId",
    "revision",
    "createdAt",
    "subject",
    "style",
    "linework",
    "shading",
    "colour",
    "placement",
    "size"
  ],
  "properties": {
    "schemaVersion": {
      "description": "Fixed for this schema revision. A breaking change bumps it and carries a migration (CONTRACTS-INV-004).",
      "const": "1.0.0"
    },
    "briefId": {
      "description": "Canonical lowercase UUID. Uses a pattern rather than 'format' so both runtimes assert it.",
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "revision": {
      "description": "Increments on every accepted change. A Design records the revision that produced it (CONTRACTS-INV-003).",
      "type": "integer",
      "minimum": 1
    },
    "createdAt": {
      "description": "RFC 3339 timestamp. ASCII digits only, so Python and JavaScript agree.",
      "type": "string",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$"
    },
    "subject": {
      "description": "What the tattoo depicts.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string",
          "minLength": 10,
          "maxLength": 2000
        },
        "elements": {
          "description": "Key motifs, kept structured so engines can weight them individually.",
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 120
          },
          "maxItems": 20,
          "uniqueItems": true
        }
      }
    },
    "style": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "primary"
      ],
      "properties": {
        "primary": {
          "$ref": "#/$defs/styleName"
        },
        "secondary": {
          "$ref": "#/$defs/styleName"
        },
        "notes": {
          "description": "Free text for nuance within a style. Never a route around the closed vocabulary, and never a place to name a living artist (PROD-INV-004, enforced by the safety module).",
          "type": "string",
          "maxLength": 600
        }
      }
    },
    "linework": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "weight"
      ],
      "properties": {
        "weight": {
          "description": "Drives the stencil's single-weight linework as much as the flash render.",
          "enum": [
            "fine",
            "medium",
            "bold",
            "mixed"
          ]
        },
        "notes": {
          "type": "string",
          "maxLength": 400
        }
      }
    },
    "shading": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "technique",
        "intensity"
      ],
      "properties": {
        "technique": {
          "enum": [
            "none",
            "whip",
            "dotwork",
            "smooth_blend",
            "solid_fill",
            "mixed"
          ]
        },
        "intensity": {
          "enum": [
            "light",
            "medium",
            "heavy"
          ]
        }
      }
    },
    "colour": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "mode"
      ],
      "properties": {
        "mode": {
          "enum": [
            "black_and_grey",
            "colour",
            "black_and_grey_with_accent"
          ]
        },
        "palette": {
          "description": "Only meaningful when ink is used. Forbidden on a pure black-and-grey brief, enforced below.",
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 40
          },
          "minItems": 1,
          "maxItems": 8,
          "uniqueItems": true
        }
      },
      "allOf": [
        {
          "description": "A black-and-grey brief cannot carry a palette. This conditional is why validation runs through the schema in both runtimes rather than through generated models, which cannot express it.",
          "if": {
            "properties": {
              "mode": {
                "const": "black_and_grey"
              }
            },
            "required": [
              "mode"
            ]
          },
          "then": {
            "not": {
              "required": [
                "palette"
              ]
            }
          }
        },
        {
          "description": "An accent brief is defined by having accent colours, so the palette is required.",
          "if": {
            "properties": {
              "mode": {
                "const": "black_and_grey_with_accent"
              }
            },
            "required": [
              "mode"
            ]
          },
          "then": {
            "required": [
              "palette"
            ]
          }
        }
      ]
    },
    "placement": {
      "description": "Where on the body. Embedded rather than extracted into its own schema until a second consumer exists (TASK-0002/DEC-004).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "bodyPart",
        "orientation"
      ],
      "properties": {
        "bodyPart": {
          "$ref": "#/$defs/bodyPart"
        },
        "orientation": {
          "enum": [
            "vertical",
            "horizontal",
            "diagonal",
            "wrapping"
          ]
        },
        "side": {
          "enum": [
            "left",
            "right",
            "centre"
          ]
        }
      }
    },
    "size": {
      "description": "Millimetres are authoritative. No pixel dimension appears anywhere in this contract (CONTRACTS-INV-001).",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "widthMm",
        "heightMm"
      ],
      "properties": {
        "widthMm": {
          "$ref": "#/$defs/millimetres"
        },
        "heightMm": {
          "$ref": "#/$defs/millimetres"
        }
      }
    },
    "constraints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "coverUp": {
          "description": "Covering existing work constrains density and darkness heavily.",
          "type": "boolean"
        },
        "avoid": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 120
          },
          "maxItems": 20,
          "uniqueItems": true
        }
      }
    }
  },
  "$defs": {
    "styleName": {
      "description": "The closed curated vocabulary from product-behavior.spec.md (CONTRACTS-INV-002). Free-text style input is mapped onto this list by the consultation, never passed through raw.",
      "enum": [
        "american_traditional",
        "fine_line",
        "black_and_grey_realism",
        "neo_traditional",
        "irezumi",
        "blackwork",
        "illustrative",
        "ornamental",
        "lettering",
        "surrealism"
      ]
    },
    "bodyPart": {
      "description": "Curated anatomical placements. Several of these are torso areas whose reference photographs are sensitive personal data; see quality-and-security.spec.md.",
      "enum": [
        "inner_forearm",
        "outer_forearm",
        "upper_arm_inner",
        "upper_arm_outer",
        "shoulder",
        "collarbone",
        "chest",
        "sternum",
        "ribs",
        "stomach",
        "upper_back",
        "lower_back",
        "spine",
        "hip",
        "thigh_front",
        "thigh_outer",
        "calf",
        "shin",
        "ankle",
        "foot",
        "wrist_inner",
        "wrist_outer",
        "hand",
        "finger",
        "neck",
        "behind_ear"
      ]
    },
    "millimetres": {
      "description": "Bounded to what is physically plausible: smaller than 5mm will not hold detail, larger than 600mm exceeds a single sitting's placement.",
      "type": "number",
      "minimum": 5,
      "maximum": 600
    }
  }
},
};

export type SchemaName = 'design' | 'tattoo-brief';

export const schemaNames: readonly SchemaName[] = [
  'design',
  'tattoo-brief',
];
