// Datos de conexión con Supabase: el MISMO proyecto que CIFEAPORC (mismos alumnos).
// La clave "publishable" está pensada para ir dentro de la app: la protección real
// son las reglas de acceso de la base de datos. NUNCA pongas aquí la clave "secret".
window.CONFIG = {
  supabaseUrl: 'https://mnfkzidvwgnqyvaidczt.supabase.co',
  supabaseKey: 'sb_publishable_oX5DsKI3WIhqkY-j6EDgKg_jJ84vVwh',
  // Dominio ficticio de las cuentas de alumno (alias + curso), igual que en CIFEAPORC.
  dominioAlumnos: 'alumnos.cifeaporc.app',
  urlPorcino: 'https://cifeaporc1.github.io/cifeaporc/',
  version: '0.1.4',
};
