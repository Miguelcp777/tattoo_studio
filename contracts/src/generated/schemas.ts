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
  'studio-job': {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tattoo.local/schemas/studio-job.schema.json",
  "title": "StudioJob",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "brief",
    "referenceIds",
    "idempotencyKey",
    "referencesReviewed"
  ],
  "properties": {
    "brief": {
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
              "description": "Optional client colour preferences. Omit to leave colour selection to the design process using the idea and reviewed references. Forbidden for pure black-and-grey.",
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
      }
    },
    "referenceIds": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^[a-f0-9]{32}$"
      }
    },
    "bodyPhotoId": {
      "type": "string",
      "pattern": "^[a-f0-9]{32}$"
    },
    "idempotencyKey": {
      "type": "string",
      "pattern": "^[a-f0-9-]{36}$"
    },
    "referencesReviewed": {
      "const": true
    },
    "placement": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "x",
        "y",
        "width"
      ],
      "properties": {
        "x": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "y": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "width": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 1
        },
        "photoWidthMm": {
          "type": "number",
          "minimum": 20,
          "maximum": 3000
        }
      }
    },
    "edit": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "parentJobId",
        "instruction"
      ],
      "properties": {
        "parentJobId": {
          "type": "string",
          "pattern": "^[a-f0-9]{32}$"
        },
        "instruction": {
          "type": "string",
          "minLength": 3,
          "maxLength": 1000,
          "pattern": "\\S"
        },
        "coverage": {
          "enum": [
            "larger",
            "smaller",
            "full"
          ]
        },
        "mode": {
          "enum": [
            "artwork",
            "placement"
          ]
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
  'studio-status': {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://inkcraft.local/schemas/studio-status.schema.json",
  "title": "StudioJobStatus",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "jobId": {
      "type": "string",
      "pattern": "^[a-f0-9]{32}$"
    },
    "state": {
      "type": "string",
      "enum": [
        "queued",
        "running",
        "succeeded",
        "failed",
        "cancelled"
      ]
    },
    "result": {
      "anyOf": [
        {
          "$ref": "#/$defs/artifact"
        },
        {
          "type": "null"
        }
      ]
    },
    "error": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "jobId",
    "state",
    "result",
    "error"
  ],
  "$defs": {
    "asset": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^[a-f0-9]{32}$"
        },
        "designId": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        },
        "mimeType": {
          "type": "string",
          "enum": [
            "image/png",
            "image/svg+xml",
            "application/pdf"
          ]
        }
      },
      "required": [
        "assetId",
        "designId",
        "mimeType"
      ],
      "title": "StudioAsset"
    },
    "artifact": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "designId": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        },
        "briefId": {
          "type": "string",
          "pattern": "^[a-f0-9-]{36}$"
        },
        "briefRevision": {
          "type": "integer",
          "minimum": 1
        },
        "size": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "widthMm": {
              "type": "number",
              "minimum": 5,
              "maximum": 600
            },
            "heightMm": {
              "type": "number",
              "minimum": 5,
              "maximum": 600
            }
          },
          "required": [
            "widthMm",
            "heightMm"
          ]
        },
        "master": {
          "$ref": "#/$defs/asset"
        },
        "stencil": {
          "$ref": "#/$defs/asset"
        },
        "stencilMirror": {
          "$ref": "#/$defs/asset"
        },
        "pdf": {
          "$ref": "#/$defs/asset"
        },
        "pdfMirror": {
          "$ref": "#/$defs/asset"
        },
        "mockup": {
          "$ref": "#/$defs/asset"
        },
        "referenceAnalysis": {
          "type": "string",
          "minLength": 1,
          "maxLength": 3000
        },
        "reviewRequired": {
          "const": true
        },
        "backgroundKind": {
          "type": "string",
          "enum": [
            "own_photo",
            "generated_anatomy"
          ]
        },
        "transform": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "xPx": {
              "type": "integer",
              "minimum": 0
            },
            "yPx": {
              "type": "integer",
              "minimum": 0
            },
            "widthPx": {
              "type": "integer",
              "minimum": 0
            },
            "heightPx": {
              "type": "integer",
              "minimum": 0
            },
            "method": {
              "enum": [
                "geometric-multiply",
                "fresh-ink-composite"
              ]
            },
            "curvature": {
              "type": "number",
              "minimum": 0,
              "maximum": 1.2,
              "description": "Approximate cylindrical warp in radians, not inferred anatomy."
            },
            "taper": {
              "type": "number",
              "minimum": 0,
              "maximum": 0.35,
              "description": "Illustrative narrowing towards the lower calf, not measured anatomy."
            },
            "scaleCalibrated": {
              "type": "boolean"
            },
            "generativePostprocess": {
              "const": false
            },
            "sourceCropPx": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "left",
                "top",
                "width",
                "height"
              ],
              "properties": {
                "left": {
                  "type": "integer",
                  "minimum": 0
                },
                "top": {
                  "type": "integer",
                  "minimum": 0
                },
                "width": {
                  "type": "integer",
                  "minimum": 1
                },
                "height": {
                  "type": "integer",
                  "minimum": 1
                }
              }
            },
            "surface": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "How strongly the ink is attenuated where the photograph's own shading says the body turns away. An illustrative approximation of surface form, not recovered depth, and never a displacement: the artwork's geometry is authoritative (ADR-0014, MOCKUP-INV-001)."
            },
            "freshness": {
              "type": "number",
              "minimum": 0,
              "maximum": 4,
              "description": "Strength of the fresh-ink reddening around the strokes. 0 when the render is a plain multiply. Illustrative, never a clinical prediction of healing (PROD-INV-003)."
            }
          },
          "required": [
            "xPx",
            "yPx",
            "widthPx",
            "heightPx",
            "method",
            "scaleCalibrated",
            "generativePostprocess"
          ]
        },
        "notice": {
          "type": "string",
          "minLength": 1
        },
        "background": {
          "$ref": "#/$defs/asset"
        },
        "edit": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "parentJobId",
            "instruction"
          ],
          "properties": {
            "parentJobId": {
              "type": "string",
              "pattern": "^[a-f0-9]{32}$"
            },
            "instruction": {
              "type": "string",
              "minLength": 3,
              "maxLength": 1000
            },
            "coverage": {
              "enum": [
                "larger",
                "smaller",
                "full"
              ]
            },
            "mode": {
              "enum": [
                "artwork",
                "placement"
              ]
            }
          }
        }
      },
      "required": [
        "designId",
        "briefId",
        "briefRevision",
        "size",
        "master",
        "stencil",
        "stencilMirror",
        "pdf",
        "pdfMirror",
        "mockup",
        "referenceAnalysis",
        "reviewRequired",
        "backgroundKind",
        "transform",
        "notice"
      ],
      "title": "GeneratedTattooArtifact"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "state": {
            "const": "succeeded"
          }
        }
      },
      "then": {
        "properties": {
          "result": {
            "$ref": "#/$defs/artifact"
          },
          "error": {
            "type": "null"
          }
        }
      },
      "else": {
        "properties": {
          "result": {
            "type": "null"
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "state": {
            "const": "failed"
          }
        }
      },
      "then": {
        "properties": {
          "error": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    }
  ]
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
          "description": "Optional client colour preferences. Omit to leave colour selection to the design process using the idea and reviewed references. Forbidden for pure black-and-grey.",
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
      "description": "Curated anatomical placements' counterpart for style. Closed vocabulary: free-text style requests are mapped onto it, and anything unmapped prompts a clarifying question rather than passing through raw (CONSULT-INV-003). Extended by TASK-0027 (ADR-0011) with six styles clients ask for that were previously rejected; `tribal` was the repository's own example of an out-of-vocabulary style.",
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
        "surrealism",
        "tribal",
        "geometric",
        "watercolour",
        "new_school",
        "chicano",
        "biomechanical"
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

export type SchemaName = 'design' | 'studio-job' | 'studio-status' | 'tattoo-brief';

export const schemaNames: readonly SchemaName[] = [
  'design',
  'studio-job',
  'studio-status',
  'tattoo-brief',
];
