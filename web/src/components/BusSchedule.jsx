import React, { useState, useEffect, useRef } from 'react';
import dashboardAPI from '../services/dashboardAPI';
import '../styles/BusSchedule.css';

export default function BusSchedule() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const res = await dashboardAPI.getBusSchedule();
      setSchedule(res.data?.schedule || null);
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setMessage({ text: 'Please upload a PDF file only.', type: 'error' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ text: 'File size must be under 10MB.', type: 'error' });
      return;
    }

    setUploading(true);
    setMessage({ text: '', type: '' });

    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await dashboardAPI.uploadBusSchedule({
        pdfBase64: base64,
        fileName: file.name,
      });

      setMessage({ text: 'Bus schedule uploaded successfully!', type: 'success' });
      await fetchSchedule();
    } catch (err) {
      console.error('Upload failed:', err);
      setMessage({ text: err.message || 'Upload failed. Please try again.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const openPdfPreview = () => {
    if (!schedule?.pdfBase64) return;
    const byteChars = atob(schedule.pdfBase64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  if (loading) return <div className="loading">Loading bus schedule...</div>;

  return (
    <div className="bus-schedule-page">
      <div className="bus-schedule-header">
        <div>
          <h2>Bus Schedule Management</h2>
          <p className="bus-schedule-subtitle">Upload the official IIT Ropar bus timing PDF. Students will see this schedule in the mobile app.</p>
        </div>
      </div>

      {/* Current Schedule Status */}
      <div className="schedule-status-card">
        <div className="schedule-status-icon-wrap">
          {schedule ? (
            <span className="schedule-status-icon active">📋</span>
          ) : (
            <span className="schedule-status-icon empty">📄</span>
          )}
        </div>
        <div className="schedule-status-info">
          <h3>{schedule ? 'Schedule Active' : 'No Schedule Uploaded'}</h3>
          {schedule ? (
            <p>
              <strong>{schedule.fileName}</strong> • Uploaded{' '}
              {new Date(schedule.uploadedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {schedule.uploadedBy ? ` by ${schedule.uploadedBy}` : ''}
            </p>
          ) : (
            <p>Upload a bus schedule PDF to make it visible to all students and staff in the mobile app.</p>
          )}
        </div>
        {schedule && (
          <button className="btn-preview" onClick={openPdfPreview}>
            View PDF
          </button>
        )}
      </div>

      {/* Upload Area */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {uploading ? (
          <div className="upload-spinner-wrap">
            <div className="upload-spinner" />
            <p>Uploading schedule...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">📤</div>
            <h3>{schedule ? 'Replace Schedule' : 'Upload Bus Schedule'}</h3>
            <p>Drag and drop a PDF here, or click to browse</p>
            <span className="upload-hint">PDF files only • Max 10MB</span>
          </>
        )}
      </div>

      {/* Message */}
      {message.text && (
        <div className={`schedule-message ${message.type}`}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      {/* PDF Preview */}
      {schedule?.pdfBase64 && (
        <div className="pdf-preview-section">
          <h3>Preview</h3>
          <div className="pdf-embed-wrap">
            <iframe
              src={`data:application/pdf;base64,${schedule.pdfBase64}`}
              title="Bus Schedule Preview"
              className="pdf-iframe"
            />
          </div>
        </div>
      )}
    </div>
  );
}
