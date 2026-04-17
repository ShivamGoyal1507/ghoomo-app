import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dashboardAPI from '../services/dashboardAPI';
import '../styles/Routes.css';

const EMPTY_STOP = { name: '', time: '' };

export default function Routes_Component() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    startPoint: '',
    endPoint: '',
    stops: [EMPTY_STOP],
    totalSeats: '40',
  });

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const response = await dashboardAPI.getRoutes();
      setRoutes(response.data);
    } catch (err) {
      console.error('Failed to fetch routes:', err);
      setErrorMessage('Unable to load routes right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({ name: '', startPoint: '', endPoint: '', stops: [EMPTY_STOP], totalSeats: '40' });
  };

  const handleStopChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, [field]: value } : stop
      ),
    }));
  };

  const addStopRow = () => {
    setFormData((prev) => ({
      ...prev,
      stops: [...prev.stops, { ...EMPTY_STOP }],
    }));
  };

  const removeStopRow = (index) => {
    setFormData((prev) => {
      if (prev.stops.length <= 1) {
        return { ...prev, stops: [{ ...EMPTY_STOP }] };
      }
      return {
        ...prev,
        stops: prev.stops.filter((_, stopIndex) => stopIndex !== index),
      };
    });
  };

  const isValid24HourTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

  const convertToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
  };

  const validateAndBuildStops = (stops) => {
    const normalized = stops
      .map((stop) => ({
        name: String(stop?.name || '').trim(),
        time: String(stop?.time || '').trim(),
      }))
      .filter((stop) => stop.name || stop.time);

    if (normalized.length === 0) {
      return { error: 'Please add at least one stop with arrival time.' };
    }

    for (let i = 0; i < normalized.length; i += 1) {
      const stop = normalized[i];
      if (!stop.name || !stop.time) {
        return { error: `Stop ${i + 1}: stop name and time are both required.` };
      }

      if (!isValid24HourTime(stop.time)) {
        return { error: `Stop ${i + 1}: time must be in HH:MM format (24-hour).` };
      }
    }

    for (let i = 1; i < normalized.length; i += 1) {
      if (convertToMinutes(normalized[i].time) <= convertToMinutes(normalized[i - 1].time)) {
        return { error: `Stop ${i + 1}: time must be later than previous stop.` };
      }
    }

    return { stops: normalized };
  };

  const formatStopsWithTime = (stops) => {
    if (!Array.isArray(stops) || stops.length === 0) {
      return '-';
    }

    return stops
      .map((stop) => {
        if (typeof stop === 'string') {
          return { name: stop, time: '' };
        }
        return {
          name: stop?.name || stop?.stop || String(stop || ''),
          time: stop?.time || stop?.arrivalTime || '',
        };
      })
      .filter((stop) => stop.name)
      .map((stop) => (stop.time ? `${stop.name} (${stop.time})` : stop.name));
  };

  const handleRouteSelect = (route) => {
    navigate(`/dashboard/routes/${route.id}`, { state: { route } });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.name.trim() || !formData.startPoint.trim() || !formData.endPoint.trim()) {
      setErrorMessage('Name, start point, and end point are required.');
      return;
    }

    const stopValidation = validateAndBuildStops(formData.stops);
    if (stopValidation.error) {
      setErrorMessage(stopValidation.error);
      return;
    }

    try {
      setSubmitting(true);
      await dashboardAPI.createRoute({
        ...formData,
        stops: stopValidation.stops,
      });
      resetForm();
      setShowForm(false);
      await fetchRoutes();
    } catch (err) {
      console.error('Failed to create route:', err);
      setErrorMessage(err?.message || 'Failed to create route. Check setup and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (routeId) => {
    if (window.confirm('Are you sure you want to delete this route?')) {
      try {
        await dashboardAPI.deleteRoute(routeId);
        fetchRoutes();
      } catch (err) {
        console.error('Failed to delete route:', err);
      }
    }
  };

  if (loading) return <div className="loading">Loading routes...</div>;

  return (
    <div className="routes-page">
      <div className="routes-header">
        <h2>Route Management</h2>
        <button
          type="button"
          className="btn-create"
          onClick={() => {
            setErrorMessage('');
            setShowForm((prev) => !prev);
          }}
        >
          {showForm ? 'Close Form' : 'Add Route'}
        </button>
      </div>

      {showForm && (
        <form className="route-form" onSubmit={handleCreate}>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Route name"
            required
          />
          <input
            type="text"
            name="startPoint"
            value={formData.startPoint}
            onChange={handleChange}
            placeholder="Start point"
            required
          />
          <input
            type="text"
            name="endPoint"
            value={formData.endPoint}
            onChange={handleChange}
            placeholder="End point"
            required
          />
          <div className="stops-editor route-form-full">
            <div className="stops-editor-header">
              <h3>Stops Timetable</h3>
              <button
                type="button"
                className="btn-add-stop"
                onClick={addStopRow}
                disabled={submitting}
              >
                Add Stop
              </button>
            </div>

            <table className="stops-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stop Name</th>
                  <th>Arrival Time (HH:MM)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {formData.stops.map((stop, index) => (
                  <tr key={`stop-row-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        type="text"
                        value={stop.name}
                        onChange={(e) => handleStopChange(index, 'name', e.target.value)}
                        placeholder="e.g. Sector 21"
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        value={stop.time}
                        onChange={(e) => handleStopChange(index, 'time', e.target.value)}
                        required
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-remove-stop"
                        onClick={() => removeStopRow(index)}
                        disabled={submitting || formData.stops.length === 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input
            type="number"
            min="1"
            name="totalSeats"
            value={formData.totalSeats}
            onChange={handleChange}
            placeholder="Total seats"
            required
          />
          <div className="route-form-actions route-form-full">
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'Adding...' : 'Create Route'}
            </button>
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                setErrorMessage('');
                resetForm();
                setShowForm(false);
              }}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {errorMessage && <p className="route-error">{errorMessage}</p>}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start Point</th>
              <th>End Point</th>
                <th>Timetable</th>
              <th>Total Seats</th>
              <th>Passengers</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
              {routes.map((route) => {
                const timetable = formatStopsWithTime(route.stops);

                return (
                  <tr key={route.id}>
                    <td>{route.name}</td>
                    <td>{route.from}</td>
                    <td>{route.to}</td>
                    <td>
                      {Array.isArray(timetable) ? (
                        <div className="timetable-list">
                          {timetable.map((item, index) => (
                            <span key={`${route.id}-stop-${index}`} className="timetable-item">{item}</span>
                          ))}
                        </div>
                      ) : (
                        timetable
                      )}
                    </td>
                    <td>{route.totalSeats || 0}</td>
                    <td>{route.bookedSeats || 0}</td>
                    <td><span className={`status-badge ${route.availableSeats > 0 ? 'active' : 'suspended'}`}>{route.availableSeats > 0 ? 'active' : 'full'}</span></td>
                    <td>
                      <button
                        type="button"
                        className="btn-view"
                        onClick={() => handleRouteSelect(route)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
