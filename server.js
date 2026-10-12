/**
 * Servidor UNIFICADO: rutas HTTP (Express) + WebSocket (ws), ambos en
 * el mismo proceso y el MISMO puerto. La clave es adjuntar el
 * WebSocketServer al servidor http de Express, en vez de crear un
 * servidor aparte en otro puerto.
 *
 * npm install
 * node server.js
 */

const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
//const OpenAI = require("openai");
const redis = require('redis');
//require("dotenv").config();
const crypto = require('crypto');

const caracteres =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@';

function generarCodigo() {
  let codigo = '';

  for (let i = 0; i < 4; i++) {
    codigo += caracteres[crypto.randomInt(0, caracteres.length)];
  }

  return codigo;
}

async function generarCodigoUnico() {
  while (true) {

    const codigo = generarCodigo();

    const agregado = await clientRedis.sAdd(
      'codigos',
      codigo
    );

    if (agregado === 1) {
      return codigo;
    }
  }
}






async function conectarRedis() {
  // 1. Crear el cliente de conexión
  const clientR = redis.createClient({
    url: 'redis://localhost:6379' // URL por defecto del servidor local
  });

  // Manejo básico de errores de conexión
  clientR.on('error', (err) => console.error('Error conectando a Redis', err));

  try {
    // 2. Conectarse al servidor
    await clientR.connect();
    console.log('¡Conectado exitosamente a Redis! 🚀');
    return clientR;

  } catch (error) {
    console.error('Hubo un problema:', error);
  }
}



const PUERTO = process.env.PUERTO || 8080;
//const openai = new OpenAI();
let clientRedis;

// --- Cliente de DigitalOcean Spaces (S3-compatible) ---
const s3 = new S3Client({
  endpoint: "https://sfo3.digitaloceanspaces.com", // ajusta a tu región real
  region: "us-east-1", // Spaces ignora la región, pero el SDK la exige
  credentials: {
    accessKeyId: "DO00T2FZWKDBAYDKFZ8Y",
    secretAccessKey: "GmzbPxXTyEJAzrHwWjeROEjfFzTt3lwM8MDdLTlke18",
  },
});

// ==================== HTTP (Express) ====================
const app = express();
app.use(cors()); // en producción, restringe esto a tu origen real
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, mensaje: "Servidor arriba" });
});

// Genera la URL prefirmada para subir directo a Spaces desde la extensión
app.post("/spaces/presign", async (req, res) => {
  try {
    const { nombreArchivo, tipoContenido } = req.body;

    if (!nombreArchivo || !tipoContenido) {
      return res
        .status(400)
        .json({ error: "Faltan nombreArchivo o tipoContenido" });
    }

    const comando = new PutObjectCommand({
      Bucket: "parcheu",
      Key: nombreArchivo,
      ContentType: tipoContenido,
      ACL: "public-read",
    });

    const urlSubida = await getSignedUrl(s3, comando, { expiresIn: 300 }); // 5 min
    //const urlPublica = `https://${process.env.SPACES_BUCKET}.nyc3.cdn.digitaloceanspaces.com/${nombreArchivo}`;
    const urlPublica = `https://parcheu.sfo3.cdn.digitaloceanspaces.com/${nombreArchivo}`;
    res.json({ urlSubida, urlPublica });
  } catch (error) {
    console.error("Error generando presign:", error);
    res.status(500).json({ error: "No se pudo generar la URL de subida" });
  }
});

const prontMAnuescrito = `
Eres un asistente especializado en digitalizar planillas de calificaciones escolares escritas a mano, de cualquier formato o país.
Vas a recibir la foto de una planilla física. La estructura puede variar: número de columnas de notas, encabezados poco claros, abreviaturas distintas según la institución. Tu tarea:

1. Extrae todos los estudiantes y las notas.
2. NÚMERO DE COLUMNAS DE NOTAS: cuenta cuántas columnas de campos de entrada (inputs) para notas hay en la tabla, SIN incluir la columna de nombres de estudiantes, ni columnas de asistencia, acciones, o cualquier otra columna que no sea para digitar una calificación numérica.
3. Para cada nota, asigna un nivel de confianza:
   - "alta": el número es completamente claro.
   - "media": legible pero podría confundirse con un dígito similar.
   - "baja": hay tachones, superposiciones, o escritura genuinamente ambigua.

Devuelve únicamente un JSON con esta estructura:

{
  "numeroColumnas: 1            
  "estudiantes": [
    {
      "numero": 1,
      "apellidos": "",
      "nombre": "",
      "notas": [
        "valor": "",
        "nivelConfianza": "bajo"      
      ]
    }
  ]
}

Reglas:
- Conserva exactamente los nombres que aparecen.
- Incluir las notas tambien.
- Si no puedes determinar con certeza el número de columnas, usa tu mejor estimación basada en los encabezados o estructura visible.
`;
const prontPantallazo = `
Eres un asistente especializado en digitalizar planillas de calificaciones  de cualquier formato o país.
Vas a recibir un pantallazo de una planilla virtual de un software. La estructura puede variar: número de columnas de notas, encabezados poco claros, abreviaturas distintas según la institución. Tu tarea:

1. Extrae todos los estudiantes y las notas.
2. Entrega la fila en la que se encuentra el nombre del estudiantes
3. NÚMERO DE COLUMNAS DE NOTAS: cuenta cuántas columnas de campos de entrada (inputs) para notas hay en la tabla, SIN incluir la columna de nombres de estudiantes, ni columnas de asistencia, acciones, o cualquier otra columna que no sea para digitar una calificación numérica.
4. Para cada nota, asigna un nivel de confianza:
   - "alta": el número es completamente claro.
   - "media": legible pero podría confundirse con un dígito similar.
   - "baja": hay tachones, superposiciones, o escritura genuinamente ambigua.

Devuelve únicamente un JSON con esta estructura:

{
  "numeroColumnas: 1            
  "estudiantes": [
    {
      "fila": 1,
      "apellidos": "",
      "nombre": "",
      "notas": [
        "valor": "",
        "nivelConfianza": "bajo"      
      ]
    }
  ]
}

Reglas:
- Conserva exactamente los nombres que aparecen.
- Incluir las notas tambien.
- Si no puedes determinar con certeza el número de columnas, usa tu mejor estimación basada en los encabezados o estructura visible.
`;

const INSTRUCCIONES = `Estás reconstruyendo una lista de estudiantes y notas a partir de varias capturas de pantalla parciales de la MISMA planilla (la tabla es más larga que lo que cabe en una pantalla, así que se tomaron varias fotos scrolleando).
 
Reglas estrictas:
 
1. La primera imagen que recibas corresponde siempre al INICIO de la lista (fila 1 en adelante). Las siguientes imágenes son continuaciones, tomadas después de hacer scroll hacia abajo.
 
2. Cada nueva imagen probablemente repite, en sus primeras filas visibles, a los ÚLTIMOS estudiantes que ya tienes en la lista acumulada (por el solape natural del scroll). Busca el nombre del ÚLTIMO estudiante de la lista acumulada dentro de la nueva imagen:
   - Si lo encuentras: usa esa fila como punto de unión. Todo lo que esté ANTES de esa fila en la imagen nueva ya lo tienes, ignóralo. Todo lo que esté DESPUÉS (incluyendo esa fila, para actualizar sus notas si cambiaron) se agrega a la lista.
   - Si NO lo encuentras en absoluto (el primer estudiante visible en la imagen nueva no es ninguno de los que ya tienes, y tampoco es el estudiante siguiente esperado): esto significa que faltan filas entre la lista acumulada y esta imagen — un salto/hueco. En ese caso, agrega igual los estudiantes nuevos que veas, pero DEBES reportarlo en el campo "advertencias" de tu respuesta, indicando entre qué dos nombres se perdió continuidad.
 
3. NUNCA repitas un estudiante que ya esté en la lista acumulada (compara por nombre). Si el mismo estudiante aparece en la imagen nueva, actualiza sus notas si son distintas, pero no lo agregues como fila nueva.
4. No incluya las notas de los estudiantes 
5. Inclir la asingatura , grado y grupo de la planilla. Normalemte se mostrara en la primera imagen
Responde ÚNICAMENTE con un JSON con esta forma exacta, sin texto adicional:
{
  "lista_actualizada": [{"nombre": "..."],
  "planilla": {grupo: "", grado : "", asignatura : ""},
  "advertencias": ["texto describiendo cualquier salto/hueco detectado, o vacío si no hay ninguno"]
}`;

async function procesarImagen(listaAcumulada, imagenUrl, totalEsperado) {
  /*const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: INSTRUCCIONES },
          {
            type: "input_text",
            text: `Lista acumulada hasta ahora (${listaAcumulada.length} de ${totalEsperado} estudiantes esperados en total, según la lectura del DOM de la planilla):${JSON.stringify(listaAcumulada)}Aquí está la nueva imagen a procesar:`,
          },

          {
            type: "input_image",
            image_url: imagenUrl,
          },
        ],
      },
    ],
  });*/

  console.log(JSON.parse(response.output_text));
  return JSON.parse(response.output_text);
}

const urlsImagenes = [];
let listaAcumulada = [];
let isListReady = false;
let clients = new Map();

app.post("/planillas/registrar", async (req, res) => {
  const { nombreArchivo, urlPublica, metadatos } = req.body;

  if (!nombreArchivo || !urlPublica) {
    return res
      .status(400)
      .json({ error: "Faltan nombreArceehivo o urlPublica" });
  }

  try {
    console.log("Planilla registrada:", {
      nombreArchivo,
      urlPublica,
      metadatos,
    });
    urlsImagenes.push(urlPublica);

    const advertenciasTotales = [];
    isListReady = true; //yemproalllllllllllllllllllllll

    if (!isListReady) {
      const resultado = await procesarImagen(listaAcumulada, urlPublica, 28);
      listaAcumulada = resultado.lista_actualizada;
      if (resultado.advertencias?.length) {
        advertenciasTotales.push(...resultado.advertencias);
      }
      if (listaAcumulada.length == 28) {
        isListReady = true;
        console.info("Ta tenemos toda planila de estudiantes");
      }
    } else {
      console.info("Planilla ready");
    }
  } catch (error) {
    console.error("Hubo un error al ssconectar con OpenAI:", error);
  }

  // Aquí guardarías la referencia en tu base de datos:
  // await db.planillas.insert({ nombreArchivo, urlPublica, metadatos, fecha: new Date() });

  res.json({ ok: true });
});

app.post("/profesor/codigo", async (req, res) => {
  const codigo = await generarCodigoUnico();
  res.json({ codigo: codigo });
});

const servidorHttp = http.createServer(app);

const wss = new WebSocketServer({ server: servidorHttp });

wss.on("connection", (socket) => {
  console.log("[WS] Cliente conectado");

  socket.on("message", async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
      //console.info("DATA " + JSON.stringify(data));
      if (data.evento === "INGRESAR_NOTAS_CELDAS_MATRIX") {

        clients.get(data.codigoDestino).send(
          JSON.stringify({
            evento: "INGRESAR_NOTAS_CELDAS_MATRIX",
            notas: data.notas
          }),
        );
      }
      if (data.evento === "hola-soy") {
        const codigoOrigen = data.codigoOrigen;

        clients.set(codigoOrigen, socket);
        socket.id = codigoOrigen;
        socket.idDestino = data.codigoDestino;

        clientRedis.sAdd('usuarios_online', codigoOrigen);
        clientRedis.sAdd('todos', codigoOrigen);

        const existe = await clientRedis.sIsMember('todos', data.codigoDestino);
        let estado = 0;
        if (existe) {
          console.info(`✅ El elementos "${data.codigoDestino}" SÍ está en el conjunto.`);
          estado = 1;

        } else {
          console.info(`❌ El elemento "${data.codigoDestino}" NO está en el conjunto.`);
          estado = -1;
        }
        const online = await clientRedis.sIsMember('usuarios_online', data.codigoDestino);
        let estadoOnline = 0;
        if (online) {
          console.info(`✅ El elemento "${data.codigoDestino}" SÍ está en el conjunto.`);
          estadoOnline = 1;
          const socketDestino = clients.get(data.codigoDestino);
          if (socketDestino && socketDestino.readyState === socketDestino.OPEN) {
            socketDestino.send(
              JSON.stringify({
                evento: "ESTADO_SESION_PAR",
                estado: estado,
                estadoDestinoOnline: estadoOnline
              }),
            );
          }


        } else {
          console.info(`❌ El elemento "${data.codigoDestino}" NO está en el conjunto.`);
          estadoOnline = 0;
        }

        socket.send(
          JSON.stringify({
            evento: "ESTADO_SESION_PAR",
            estado: estado,
            estadoDestinoOnline: estadoOnline
          }),
        );


      }
      if (data.evento === "RECIBIR_MATRIZ_EXTENSION") {
        console.info("DATA " + JSON.stringify(data));

        clients.get(data.codigoDestino).send(
          JSON.stringify({
            evento: "MATRIX_NOTAS_PROFE",
            matrix: data.matrix,
          }),
        );
      }

      if (data.evento === "planillas_registrar") {

        nombreArchivo = data.nombreArchivo;
        urlPublica = data.urlPublica;
        metadatos = data.metadatos;
        filas = data.filas;
        columnas = data.columnas;
        primeraImagen = data.primeraImagen;
        console.info("urlPublica " + urlPublica);

        clients.get(data.codigoDestino).send(
          JSON.stringify({
            evento: "PROCESAR_IMAGEN_PLANILLA",
            nombreArchivo: nombreArchivo,
            filas: filas,
            columnas: columnas,
            urlPublica: urlPublica,
            primeraImagen: primeraImagen,
            metadatos: metadatos,
          }),
        );
      }
      if (data.evento === "ACTIVAR_CELDA_MATRIX") {
        console.info("vamos a prender la celdaj");
        console.info(data.codigoDestino);

        clients.get(data.codigoDestino).send(
          JSON.stringify({
            evento: "ACTIVAR_CELDA_MATRIX",
            columna: data.columna,
            fila: data.fila,
          }),
        );
      }
      if (data.evento === "ACTIVAR_INICIO_CARGA_MATRIX") {
        console.info("Iniciamos descarga ssDe Maddtrix");
        console.info(data.codigoDestino);
        const clienteDestino = clients.get(data.codigoDestino);
        if (clienteDestino) {
          clienteDestino.send(
            JSON.stringify({
              evento: "ACTIVAR_INICIO_CARGA_MATRIX"
            }),
          );
        }
      }
    } catch (error) {

      mensaje = { tipo: "texto", contenido: data.toString() };
      console.info(`Error : ${error}.`);

    }
  });

  socket.on("close", () => {
    console.log("[WS] Cliente desconectado" + socket.id);
    if (typeof socket.id === "undefined") {
      console.log("La variable es sssssssssssssso no ha sido declarada.");
    }
    else {
      clientRedis.sRem('usuarios_online', socket.id);
      const socketRemover = clients.get(socket.idDestino);
      if (socketRemover && socketRemover.readyState === socketRemover.OPEN) {

        socketRemover.send(
          JSON.stringify({
            evento: "ESTADO_SESION_PAR",
            estado: 0,
          }),
        );
      }
    }


  });
});

/** Utilidad para mandarle un comando a TODOS los clientes conectados (ej. la extensión) */
function difundir(objeto) {
  const texto = JSON.stringify(objeto);
  wss.clients.forEach((cliente) => {
    if (cliente.readyState === cliente.OPEN) cliente.send(texto);
  });
}


async function iniciarServidor() {
  try {
    // Esperamos a que Redis se conecte por completo antes de seguir
    clientRedis = await conectarRedis();

    // Una vez conectado Redis, encendemos el servidor HTTP
    const PUERTO = process.env.PUERTO || 8080;
    servidorHttp.listen(PUERTO, () => {
      console.log(`Servidor (HTTP + WS) escuchando en el puerto ${PUERTO}`);
      console.log(`  HTTP:  http://localhost:${PUERTO}/health`);
      console.log(`  WS:    ws://localhost:${PUERTO}`);
    });
  } catch (error) {
    console.error('❌ No se pudo iniciar la aplicación debido a un fallo en Redis:', error);
    process.exit(1); // Detiene la app si Redis no funciona
  }
}
iniciarServidor();



