import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { api } from '../../api/client';
import Spinner from '../../components/Spinner';

function Boton({ activo, onClick, children, titulo }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick}
      className={`rounded px-2.5 py-1 text-sm font-bold transition ${activo ? 'bg-primary text-white' : 'bg-white text-ink hover:bg-info-bg'} border border-line`}>
      {children}
    </button>
  );
}

function Barra({ ed }) {
  if (!ed) return null;
  const enlace = () => {
    const previo = ed.getAttributes('link').href || 'https://';
    const url = window.prompt('Dirección del enlace (vacío para quitarlo):', previo);
    if (url === null) return;
    if (url === '') return ed.chain().focus().unsetLink().run();
    ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const c = () => ed.chain().focus();
  return (
    <div className="flex flex-wrap gap-1.5 rounded-t-md border border-b-0 border-[#7b8794] bg-surface-alt p-2">
      <Boton titulo="Negrita" activo={ed.isActive('bold')} onClick={() => c().toggleBold().run()}><b>N</b></Boton>
      <Boton titulo="Cursiva" activo={ed.isActive('italic')} onClick={() => c().toggleItalic().run()}><i>C</i></Boton>
      <Boton titulo="Subrayado" activo={ed.isActive('underline')} onClick={() => c().toggleUnderline().run()}><u>S</u></Boton>
      <Boton titulo="Tachado" activo={ed.isActive('strike')} onClick={() => c().toggleStrike().run()}><s>T</s></Boton>
      <Boton titulo="Título" activo={ed.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>H2</Boton>
      <Boton titulo="Subtítulo" activo={ed.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</Boton>
      <Boton titulo="Lista con viñetas" activo={ed.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>• Lista</Boton>
      <Boton titulo="Lista numerada" activo={ed.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>1. Lista</Boton>
      <Boton titulo="Cita" activo={ed.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>“ ”</Boton>
      <Boton titulo="Enlace" activo={ed.isActive('link')} onClick={enlace}>Enlace</Boton>
      <Boton titulo="Alinear a la izquierda" activo={ed.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()}>⟸</Boton>
      <Boton titulo="Centrar" activo={ed.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()}>≡</Boton>
      <Boton titulo="Alinear a la derecha" activo={ed.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()}>⟹</Boton>
      <Boton titulo="Línea separadora" onClick={() => c().setHorizontalRule().run()}>―</Boton>
      <Boton titulo="Deshacer" onClick={() => c().undo().run()}>↶</Boton>
      <Boton titulo="Rehacer" onClick={() => c().redo().run()}>↷</Boton>
    </div>
  );
}

export default function Informacion() {
  const [titulo, setTitulo] = useState('');
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const ed = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
  });

  useEffect(() => {
    if (!ed) return;
    api('/settings')
      .then((r) => {
        setTitulo(r.info.titulo);
        ed.commands.setContent(r.info.contenidoHtml || '');
        setListo(true);
      })
      .catch((e) => { setError(e.message); setListo(true); });
  }, [ed]);

  const guardar = async () => {
    setError(''); setMsg(''); setBusy(true);
    try {
      const html = ed.isEmpty ? '' : ed.getHTML();
      const r = await api('/settings/info', { method: 'PUT', body: { titulo: titulo.trim(), contenidoHtml: html } });
      ed.commands.setContent(r.info.contenidoHtml || '');
      setMsg(r.info.contenidoHtml
        ? 'Información publicada. Ya aparece en el inicio de todos los usuarios.'
        : 'Contenido vacío: la tarjeta de políticas ya no se muestra a los usuarios.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!listo) return <Spinner />;

  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-muted">
        Redacta las políticas e instrucciones de uso. Se muestran en el inicio de todos los usuarios de tu compañía.
        Por seguridad el sistema elimina scripts e imágenes. Para retirar la información, deja el editor vacío.
      </p>
      {error && <div role="alert" className="alert-error"><p>{error}</p></div>}
      {msg && <div className="alert-success"><p>{msg}</p></div>}

      <div>
        <label htmlFor="ti" className="label">Título de la tarjeta</label>
        <input id="ti" className="field" minLength={3} maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>

      <div>
        <span className="label">Contenido</span>
        <Barra ed={ed} />
        <EditorContent editor={ed} className="editor-rico contenido-rico rounded-b-md border border-[#7b8794] bg-white" />
      </div>

      <button onClick={guardar} disabled={busy || titulo.trim().length < 3} className="btn-primary">
        {busy ? 'Publicando…' : 'Publicar información'}
      </button>
    </div>
  );
}