import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Shows a "view receipt" link (if one exists and the viewer is allowed)
// and/or an "attach receipt" uploader for the request's owner.
// Visibility of the file itself is enforced server-side by storage RLS —
// admins/deputies and the owner can fetch it, nobody else can.
export default function Receipt({ request, isOwner, canView, onAttached }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    setError(null)

    const path = `${request.id}/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(path, file, { upsert: false })

    if (uploadErr) {
      setUploading(false)
      setError(uploadErr.message)
      return
    }

    const { error: rpcErr } = await supabase.rpc('attach_receipt', {
      p_request_id: request.id,
      p_path: path,
    })

    setUploading(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    onAttached?.()
  }

  const view = async () => {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(request.receipt_path, 60)
    if (error) {
      setError(error.message)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="text-sm mt-1 flex flex-wrap items-center gap-3">
      {request.receipt_path && canView && (
        <button onClick={view} className="underline text-inkSoft hover:text-ink">
          View receipt
        </button>
      )}
      {isOwner && (
        <label className="underline text-inkSoft hover:text-ink cursor-pointer">
          {uploading
            ? 'Uploading…'
            : request.receipt_path
              ? 'Replace receipt'
              : 'Attach receipt'}
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            disabled={uploading}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      )}
      {error && <span className="text-stampRed">{error}</span>}
    </div>
  )
}
