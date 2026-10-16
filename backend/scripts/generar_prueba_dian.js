const ExcelJS = require('exceljs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

(async () => {
  const cufe = () => crypto.randomBytes(48).toString('hex'); // 96 caracteres hex
  const c1 = cufe();
  const c2 = cufe();
  const c3 = cufe();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DIAN');
  ws.columns = [
    { header: 'cufe', key: 'cufe', width: 100 },
    { header: 'nit_emisor', key: 'ne', width: 16 },
    { header: 'nombre_emisor', key: 'nom', width: 30 },
    { header: 'nit_receptor', key: 'nr', width: 16 },
    { header: 'fecha_emision', key: 'f', width: 16 },
    { header: 'valor_total', key: 'v', width: 18 },
  ];

  // 1) válida, receptor = NIT de Empresa Demo con DV, fecha nativa
  ws.addRow({ cufe: c1, ne: '800197268', nom: 'Comercio Uno SAS', nr: '900123456-7', f: new Date(Date.UTC(2026, 9, 1)), v: 85000 });
  // 2) válida, receptor con DV pegado, fecha DD/MM/AAAA y valor con formato colombiano
  ws.addRow({ cufe: c2, ne: '890900608-9', nom: 'Comercio Dos SA', nr: '9001234567', f: '01/10/2026', v: '$1.250.000,50' });
  // 3) válida, pero a nombre de OTRA compañía (para probar NIT_NO_COINCIDE)
  ws.addRow({ cufe: c3, ne: '860002964', nom: 'Comercio Tres LTDA', nr: '800111222', f: '2026-10-03', v: 42000 });
  // 4) inválida: CUFE corto
  ws.addRow({ cufe: 'abc123', ne: '800197268', nom: 'Comercio Cuatro', nr: '900123456', f: '2026-10-04', v: 1000 });
  // 5) inválida: CUFE repetido dentro del archivo
  ws.addRow({ cufe: c1, ne: '800197268', nom: 'Comercio Uno SAS', nr: '900123456', f: '2026-10-01', v: 85000 });

  const destino = path.join(os.homedir(), 'dian_prueba.xlsx');
  await wb.xlsx.writeFile(destino);

  console.log('Archivo creado en:', destino);
  console.log('\nGuarda estos CUFE para el Módulo 5:');
  console.log('CUFE_OK        =', c1, '(valor 85000, receptor correcto)');
  console.log('CUFE_OK2       =', c2, '(valor 1250000.50, receptor correcto)');
  console.log('CUFE_OTRO_NIT  =', c3, '(receptor distinto)');
  console.log('CUFE_NO_CARGADO=', cufe(), '(no existe en la base)');
})();