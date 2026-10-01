/**
 * What each catalogue variant looks like, in Spanish, for the client (TASK-0084, audit).
 *
 * The catalogue's `characteristics` are English on purpose: they are written into the image
 * model's prompt. The advanced style picker showed them to the client as they are, mixing
 * languages; it now shows these. A variant missing here falls back to nothing rather than English.
 */
export const STYLE_HINTS: Readonly<Record<string, string>> = {
  'american_traditional.classic':
    'Anclas y rosas náuticas, contorno negro grueso, rojo y verde planos',
  'american_traditional.dark': 'Sombreado muy negro con poco color, aire gastado y hecho a mano',
  'american_traditional.bold_modern': 'Contornos más gruesos, formas simplificadas, colores vivos',
  'biomechanical.mechanical': 'Pistones, cables y placas bajo la piel rasgada',
  'biomechanical.organic': 'Estructuras óseas acanaladas, aspecto alienígena y húmedo',
  'biomechanical.cyber': 'Circuitos y juntas de paneles, brillo metálico frío',
  'black_and_grey_realism.portrait': 'Rostro humano o animal, tonos fotográficos, detalle nítido',
  'black_and_grey_realism.textured': 'Pelo, piedra o tela, con el detalle del material',
  'black_and_grey_realism.high_contrast':
    'Negros profundos y piel desnuda como luz, iluminación dramática',
  'blackwork.solid': 'Grandes zonas negras continuas, silueta legible de lejos',
  'blackwork.negative': 'El motivo hecho con piel desnuda dentro de un fondo negro',
  'blackwork.etching': 'Rayado paralelo denso, como un grabado',
  'chicano.script': 'Letras enlazadas y elaboradas con sombra fina',
  'chicano.portrait': 'Rostro de sombreado suave y transiciones fotográficas',
  'chicano.religious': 'Manos rezando, rosario y sagrado corazón, humo y rayos de luz',
  'fine_line.micro': 'Muy pequeño, trazo finísimo, mucho espacio libre alrededor',
  'fine_line.botanical': 'Tallos y hojas delicados de un solo trazo continuo',
  'fine_line.dotted': 'Sombreado de puntos finos entre contornos delgados',
  'geometric.sacred': 'Círculos y polígonos entrelazados, trazado a compás',
  'geometric.linework': 'Rectas largas y arcos finos, abierto y ligero',
  'geometric.tessellation': 'Un mosaico que se repite y llena la forma sin huecos',
  'illustrative.sketch': 'Líneas de construcción visibles y contornos sueltos',
  'illustrative.engraving': 'Volumen con rayado cruzado, aire de xilografía',
  'illustrative.storybook': 'Ilustración de cuento, color plano y formas redondeadas',
  'irezumi.dragon': 'Dragón enroscado con escamas, viento y nubes',
  'irezumi.koi': 'Carpa koi en agua estilizada, olas y pétalos',
  'irezumi.hannya': 'Máscara hannya con hojas de arce, contraste negro y rojo',
  'lettering.script': 'Cursiva enlazada y fluida, trazos gruesos y finos',
  'lettering.blackletter': 'Letra gótica angulosa, astas verticales gruesas',
  'lettering.sans': 'Mayúsculas geométricas de palo seco, grosor uniforme',
  'neo_traditional.floral': 'Pétalos y hojas en capas, tonos joya, marco decorativo',
  'neo_traditional.animal': 'Retrato animal estilizado con ornamento y contornos jerarquizados',
  'neo_traditional.art_nouveau': 'Curvas sinuosas modernistas, paleta suave, borde ornamental',
  'new_school.cartoon': 'Formas redondas y elásticas, contorno grueso, colores primarios',
  'new_school.graffiti': 'Degradados de spray y sombra marcada, influencia del grafiti',
  'new_school.horror': 'Exageración grotesca, verdes ácidos y morados',
  'ornamental.mandala': 'Simetría radial concéntrica, anillos de pétalos',
  'ornamental.filigree': 'Volutas finas y perlado, detalle de joyería',
  'ornamental.armband': 'Banda continua que rodea el miembro con un motivo repetido',
  'surrealism.melting': 'Formas que se derriten y se funden entre sí',
  'surrealism.collage': 'Objetos sin relación fundidos en un cuerpo imposible',
  'surrealism.cosmic': 'Figuras que se abren a estrellas y planetas',
  'tribal.polynesian': 'Filas densas de pequeños símbolos repetidos en bandas',
  'tribal.maori': 'Espirales koru y curvas fluidas, negro intenso',
  'tribal.neotribal': 'Puntas y ganchos afilados, mucho espacio negativo, gráfico',
  'watercolour.splash': 'Color que salpica desde el motivo en gotas y trazos',
  'watercolour.gradient': 'Dos o tres colores que se funden suavemente',
  'watercolour.inkwash': 'Aguada de un color con acentos de tinta, aire sumi-e',
};
