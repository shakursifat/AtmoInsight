import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useSocket } from '../api/socket';
import { Shield, FileText, Clock, CheckCircle, XCircle, MapPin, Loader2, AlertTriangle, PlusCircle } from 'lucide-react';

export default function Reports() {
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Citizen form state
  const [description, setDescription] = useState('');
  const [locationId, setLocationId] = useState('1'); // Default to 1 (Dhaka City Centre)
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [locations, setLocations] = useState([]);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = (update) => {
      setReports(prev => prev.map(r => r.report_id === update.report_id ? { ...r, status: update.new_status } : r));
    };
    socket.on('report_status_update', handleStatusUpdate);
    return () => socket.off('report_status_update', handleStatusUpdate);
  }, [socket]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      // Fetch reports for all authenticated users
      fetchReports(parsedUser);
      fetchLocations();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchLocations = async () => {
    try {
      const res = await client.get('/api/lookup/locations');
      setLocations(res.data.locations || []);
      if (res.data.locations?.length > 0) {
        setLocationId(res.data.locations[0].location_id.toString());
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
  };

  const fetchReports = async (currentUser) => {
    try {
      setLoading(true);
      const isPrivileged = currentUser?.role_name === 'Admin' || currentUser?.role_name === 'Scientist' || currentUser?.role_id === 1 || currentUser?.role_id === 2;
      const endpoint = isPrivileged ? '/api/reports/all' : '/api/reports/my';
      const res = await client.get(endpoint, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setReports(res.data.reports || []);
    } catch (err) {
      setError('Failed to load reports. ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCitizenSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSubmitSuccess(false);
    
    try {
      await client.post('/api/reports/submit', 
        { description, location_id: parseInt(locationId) },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }}
      );
      setSubmitSuccess(true);
      setDescription('');
      fetchReports(user); // Refresh their personal list
    } catch (err) {
      setError('Failed to submit report. ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (reportId, newStatusId) => {
    try {
      await client.put(`/api/reports/${reportId}/status`, 
        { status_id: parseInt(newStatusId) },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }}
      );
      // Update local state to reflect change without refetching fully
      fetchReports(user); // refetch fully to ensure sorting and status names are up to date
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.error || err.message));
    }
  };

  const getStatusBadge = (statusName) => {
    switch (statusName) {
      case 'Open': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20"><Clock className="w-3.5 h-3.5" /> Pending / Open</span>;
      case 'In Progress': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20"><AlertTriangle className="w-3.5 h-3.5" /> In Progress</span>;
      case 'Resolved': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><CheckCircle className="w-3.5 h-3.5" /> Done / Resolved</span>;
      case 'Rejected': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"><XCircle className="w-3.5 h-3.5" /> Rejected</span>;
      default: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">{statusName || 'Unknown'}</span>;
    }
  };

  // Not logged in view
  if (!loading && !user) {
    return (
      <div className="flex-1 overflow-auto bg-[#0A0A0A] p-6 lg:p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-surface-secondary border border-border-subtle rounded-xl p-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center mb-6">
            <Shield className="w-8 h-8 text-text-muted" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-3 font-data tracking-wide">Identification Required</h2>
          <p className="text-text-muted mb-8 text-sm leading-relaxed">
            You must be signed in to the AtmoInsight network to view or submit environmental incident reports.
          </p>
          <Link to="/login" className="bg-data-blue text-surface-primary hover:bg-data-blue/90 font-semibold py-2.5 px-8 rounded-md transition-colors w-full sm:w-auto">
            Proceed to Terminal Auth
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0A0A0A] p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border-subtle pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-data-blue" />
              <span className="text-data-blue text-xs font-data uppercase tracking-widest font-semibold">Incident Logs</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              {user?.role_id === 1 ? 'Global Reports Control' : 'Submit Incident Report'}
            </h1>
            <p className="text-text-muted text-sm mt-1 max-w-2xl">
              {user?.role_id === 1 
                ? 'Review and update the status of environmental anomalies submitted by the citizen network.'
                : 'Help monitor your local area by submitting structured reports of environmental anomalies or disaster impacts.'}
            </p>
          </div>
          <div className="flex items-center gap-3 bg-surface-secondary px-4 py-2 rounded-lg border border-border-subtle shrink-0">
            <div className="w-8 h-8 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center">
              <Shield className={`w-4 h-4 ${user?.role_id === 1 ? 'text-accent-gold' : 'text-text-muted'}`} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Current Clearance</span>
              <span className="text-sm font-data font-medium text-text-primary">
                {user?.role_id === 1 ? 'L1 : ADMIN' : (user?.role_id === 2 ? 'L2 : SCIENTIST' : 'L3 : CITIZEN')}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-data-blue animate-spin" />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* CITIZEN VIEW */}
            {user?.role_id !== 1 && (
              <div className="space-y-8">
                <div className="max-w-2xl mx-auto bg-surface-secondary border border-border-subtle rounded-xl p-6 lg:p-8 shadow-sm">
                  
                  {submitSuccess && (
                    <div className="mb-8 p-4 bg-severity-safe/10 border border-severity-safe/30 rounded-lg flex items-start gap-4">
                      <CheckCircle className="w-6 h-6 text-severity-safe shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-severity-safe font-semibold text-sm">Report Submitted Successfully</h3>
                        <p className="text-severity-safe/80 text-sm mt-1">Your report has been logged and marked as open. Analysts will review it shortly. Thank you for contributing to the network.</p>
                      </div>
                    </div>
                  )}
                  
                  {error && (
                    <div className="mb-8 p-4 bg-severity-critical/10 border border-severity-critical/30 rounded-lg flex items-start gap-4">
                      <AlertTriangle className="w-5 h-5 text-severity-critical shrink-0 mt-0.5" />
                      <p className="text-severity-critical text-sm">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleCitizenSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" /> Designated Sector
                      </label>
                      <select
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        required
                        className="w-full bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-4 py-3 text-text-primary text-sm transition-colors"
                      >
                        {locations.map(loc => (
                          <option key={loc.location_id} value={loc.location_id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                       <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" /> Incident Documentation
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        placeholder="Describe the environmental anomaly observed in detail (e.g., dense smog, chemical odors, unauthorized dumping, localized flooding)..."
                        className="w-full h-40 bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-4 py-3 text-text-primary text-sm transition-colors resize-none placeholder-text-muted/50"
                      />
                    </div>

                    <div className="pt-2 border-t border-border-subtle flex justify-end">
                      <button
                        type="submit"
                        disabled={submitting || !description.trim()}
                        className="bg-data-blue text-surface-primary hover:bg-data-blue/90 font-semibold py-2.5 px-6 rounded-md transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Transmitting...</>
                        ) : (
                          <><PlusCircle className="w-4 h-4" /> Submit Report to Core</>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* CITIZEN PAST REPORTS */}
                <div className="max-w-2xl flex flex-col w-full mx-auto bg-surface-secondary border border-border-subtle rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-data-blue" />
                    Your Previous Transmissions
                  </h2>
                  
                  {reports.length === 0 ? (
                    <p className="text-sm text-text-muted py-4">You have not submitted any reports yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {reports.map(report => (
                        <div key={report.report_id} className="p-4 rounded-lg border border-border-subtle bg-surface-primary/30 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-xs text-text-muted font-data mb-2">
                              Ticket #{String(report.report_id).padStart(4, '0')} • {new Date(report.timestamp).toLocaleString()}
                            </p>
                            <p className="text-sm text-text-primary">{report.description}</p>
                            <p className="text-xs text-text-secondary mt-2 flex items-center gap-1.5 font-medium">
                              <MapPin className="w-3.5 h-3.5" /> Sector: {report.location_name}
                            </p>
                          </div>
                          <div className="shrink-0 mt-2 sm:mt-0">
                            {getStatusBadge(report.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ADMIN VIEW */}
            {user?.role_id === 1 && (
              <div className="bg-surface-secondary border border-border-subtle rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-text-secondary whitespace-nowrap">
                    <thead className="text-xs uppercase bg-surface-primary/50 text-text-muted font-semibold tracking-wider border-b border-border-subtle">
                      <tr>
                        <th className="px-6 py-4">ID</th>
                        <th className="px-6 py-4">Date / Time</th>
                        <th className="px-6 py-4">Operator</th>
                        <th className="px-6 py-4 w-96">Description Log</th>
                        <th className="px-6 py-4">Sector ID</th>
                        <th className="px-6 py-4">Network Status</th>
                        <th className="px-6 py-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {reports.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-12 text-center text-text-muted">
                            No citizen reports currently logged in the system.
                          </td>
                        </tr>
                      ) : (
                        reports.map((report) => (
                          <tr key={report.report_id} className="hover:bg-surface-primary/50 transition-colors">
                            <td className="px-6 py-4 font-data font-medium text-text-primary">#{String(report.report_id).padStart(4, '0')}</td>
                            <td className="px-6 py-4 font-data">{new Date(report.timestamp).toLocaleString()}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 rounded bg-surface-primary border border-border-subtle text-text-primary font-medium text-xs">
                                @{report.username || `User-${report.user_id}`}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-normal min-w-[300px]">
                              <p className="text-text-primary text-sm line-clamp-2" title={report.description}>
                                {report.description}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-center font-data text-text-primary">{report.location_name}</td>
                            <td className="px-6 py-4">
                              {getStatusBadge(report.status)}
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={report.status === 'Open' ? 1 : (report.status === 'In Progress' ? 2 : (report.status === 'Resolved' ? 3 : 4))}
                                onChange={(e) => handleStatusChange(report.report_id, e.target.value)}
                                className="bg-surface-primary border border-border-subtle focus:border-accent-gold text-text-primary text-xs rounded px-2 py-1.5 outline-none cursor-pointer"
                              >
                                <option value="1">Pending</option>
                                <option value="2">In Progress</option>
                                <option value="3">Done</option>
                                <option value="4">Rejected</option>
                              </select>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}
