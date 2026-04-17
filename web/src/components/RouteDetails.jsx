import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import dashboardAPI from '../services/dashboardAPI';
import '../styles/RouteDetails.css';

function parseTimeToMinutes(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    const suffix = twelveHour[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    const normalizedHour = (hour % 12) + (suffix === 'PM' ? 12 : 0);
    return (normalizedHour * 60) + minute;
  }

  const twentyFourHour = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    return (Number(twentyFourHour[1]) * 60) + Number(twentyFourHour[2]);
  }

  return null;
}

function formatMinutesTo12Hour(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '';
  const dayMinutes = 24 * 60;
  const normalized = ((Math.round(totalMinutes) % dayMinutes) + dayMinutes) % dayMinutes;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function deriveTimesAcrossStops(stops, departureTime, returnTime) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [];
  }

  const departureMinutes = parseTimeToMinutes(departureTime);
  const returnMinutes = parseTimeToMinutes(returnTime);

  if (departureMinutes == null || returnMinutes == null) {
    return stops;
  }

  let adjustedReturn = returnMinutes;
  if (adjustedReturn < departureMinutes) {
    adjustedReturn += 24 * 60;
  }

  if (stops.length === 1) {
    return [{ ...stops[0], time: stops[0].time || formatMinutesTo12Hour(departureMinutes) }];
  }

  const span = adjustedReturn - departureMinutes;
  return stops.map((stop, index) => {
    if (stop.time) {
      return stop;
    }
    const ratio = index / (stops.length - 1);
    const minute = departureMinutes + (span * ratio);
    return { ...stop, time: formatMinutesTo12Hour(minute) };
  });
}

function normalizeStops(stops, departureTime, returnTime) {
  if (!Array.isArray(stops)) {
    return [];
  }

  const normalized = stops
    .map((stop) => {
      if (typeof stop === 'string') {
        const match = stop.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        if (match) {
          return {
            name: String(match[1] || '').trim(),
            time: String(match[2] || '').trim(),
          };
        }

        return { name: stop, time: '' };
      }

      return {
        name: stop?.name || stop?.stop || String(stop || ''),
        time: stop?.time || stop?.arrivalTime || '',
      };
    })
    .filter((stop) => stop.name);

  return deriveTimesAcrossStops(normalized, departureTime, returnTime);
}

export default function RouteDetails() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [route, setRoute] = useState(location.state?.route || null);
  const [loading, setLoading] = useState(!location.state?.route);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const fetchRoute = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await dashboardAPI.getRoutes();
        const matchedRoute = (response.data || []).find((item) => String(item.id) === String(routeId));

        if (!mounted) return;

        if (!matchedRoute) {
          setError('Route not found.');
          return;
        }

        setRoute(matchedRoute);
      } catch (err) {
        if (!mounted) return;
        setError('Unable to load route details right now.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (!route || String(route.id) !== String(routeId)) {
      fetchRoute();
    }

    return () => {
      mounted = false;
    };
  }, [route, routeId]);

  const stops = useMemo(
    () => normalizeStops(route?.stops, route?.departureTime, route?.returnTime),
    [route?.stops, route?.departureTime, route?.returnTime]
  );
  const totalSeats = Number(route?.totalSeats || 0);
  const bookedSeats = Number(route?.bookedSeats || 0);
  const availableSeats = Number(
    route?.availableSeats ?? Math.max(totalSeats - bookedSeats, 0)
  );
  const waitingCount = Number(route?.waitingCount || 0);
  const occupancy = totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 100) : 0;

  if (loading) {
    return <div className="loading">Loading route details...</div>;
  }

  if (error || !route) {
    return (
      <div className="route-details-page">
        <button type="button" className="btn-back" onClick={() => navigate('/dashboard/routes')}>
          Back to Routes
        </button>
        <p className="route-details-error">{error || 'Route not found.'}</p>
      </div>
    );
  }

  return (
    <div className="route-details-page">
      <div className="route-details-header">
        <button type="button" className="btn-back" onClick={() => navigate('/dashboard/routes')}>
          Back to Routes
        </button>
        <h2>{route.name || 'Route Details'}</h2>
      </div>

      <div className="route-meta-grid">
        <div className="meta-card">
          <p className="meta-label">Route ID</p>
          <p className="meta-value mono">{route.id}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Start Point</p>
          <p className="meta-value">{route.from || route.startPoint || '-'}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">End Point</p>
          <p className="meta-value">{route.to || route.endPoint || '-'}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Departure Time</p>
          <p className="meta-value">{route.departureTime || '-'}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Return Time</p>
          <p className="meta-value">{route.returnTime || '-'}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Total Seats</p>
          <p className="meta-value">{totalSeats}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Booked Seats</p>
          <p className="meta-value">{bookedSeats}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Available Seats</p>
          <p className="meta-value">{availableSeats}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Waiting List</p>
          <p className="meta-value">{waitingCount}</p>
        </div>
        <div className="meta-card">
          <p className="meta-label">Occupancy</p>
          <p className="meta-value">{occupancy}%</p>
        </div>
      </div>

      <div className="route-stops-card">
        <h3>Stops and Timetable</h3>
        {stops.length === 0 ? (
          <p className="muted">No stops available for this route.</p>
        ) : (
          <table className="route-stops-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Stop Name</th>
                <th>Arrival Time</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop, index) => (
                <tr key={`${route.id}-detail-stop-${index}`}>
                  <td>{index + 1}</td>
                  <td>{stop.name}</td>
                  <td>{stop.time || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
