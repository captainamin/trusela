import React, { useState, useEffect } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { Plus, Filter, ClipboardList, CheckCircle2, Clock, AlertCircle, Calendar, XCircle } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import axios from 'axios';
import { toast } from 'sonner';

export default function MarketTasks() {
  const { user } = useUser();
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await axios.get(`/api/market/tasks/${user.uid}`);
      setTasks(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Completed': return 'bg-emerald-100 text-emerald-700';
      case 'In Progress': return 'bg-blue-100 text-blue-700';
      default: return 'bg-orange-100 text-orange-700';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch(priority) {
      case 'High': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'Medium': return <Clock className="w-4 h-4 text-orange-500" />;
      default: return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
    }
  };

  const AddTaskModal = () => {
    const [formData, setFormData] = useState({
      title: '',
      description: '',
      priority: 'Medium',
      assignedTo: '',
      dueDate: '',
      category: 'Inspection'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleClose = () => {
      setShowAddTaskModal(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;

      setIsSubmitting(true);
      try {
        await axios.post('/api/market/tasks', {
          userId: user.uid,
          ...formData
        });
        toast.success('Task created successfully!');
        handleClose();
        fetchTasks();
      } catch (err: any) {
        console.error(err);
        const errorMsg = err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'Failed to create task.';
        toast.error(`Error: ${errorMsg}`);
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!showAddTaskModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-lg w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Create Task</h2>
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required 
                value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" rows={3} required
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option value="Inspection">Inspection</option>
                  <option value="Revenue Collection">Revenue Collection</option>
                  <option value="Registration">Registration</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                <input type="text" placeholder="Official Name / ID" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required 
                  value={formData.assignedTo} onChange={e => setFormData({...formData, assignedTo: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required 
                  value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={handleClose} disabled={isSubmitting} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? 'Creating...' : <><CheckCircle2 className="w-5 h-5"/> Create Task</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <MarketLayout title="Task Management">
      
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex gap-2 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none px-4 py-2 bg-white border border-emerald-100 text-gray-700 rounded-lg hover:bg-emerald-50 text-sm font-bold flex justify-center items-center gap-2 shadow-sm">
            <Filter className="w-4 h-4" /> Filter Tasks
          </button>
        </div>
        <button onClick={() => setShowAddTaskModal(true)} className="w-full sm:w-auto px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm font-bold flex justify-center items-center gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Create New Task
        </button>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-900"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-500 bg-white rounded-xl shadow-sm border border-emerald-50">
          No tasks available. Click "Create New Task" to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasks.map((task) => (
            <div key={task.id} className="bg-white rounded-xl shadow-sm border border-emerald-50 p-5 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col h-full">
              
              {/* Top row */}
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusColor(task.status)}`}>
                  {task.status}
                </span>
                <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md">
                  {getPriorityIcon(task.priority)}
                  <span className="text-xs font-bold text-gray-600">{task.priority}</span>
                </div>
              </div>

              {/* Title & Desc */}
              <div className="mb-4 flex-1">
                <h3 className="font-bold text-gray-900 text-lg mb-1">{task.title}</h3>
                <p className="text-sm text-gray-500 line-clamp-2">{task.description}</p>
              </div>

              {/* Meta */}
              <div className="space-y-3 pt-4 border-t border-gray-100 mt-auto">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 text-xs font-bold">
                    {task.assignedTo?.charAt(0) || '?'}
                  </div>
                  <span className="text-gray-700 font-medium truncate">{task.assignedTo}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                    <ClipboardList className="w-3 h-3" /> {task.category}
                  </span>
                  <span className="flex items-center gap-1 text-red-600 font-medium">
                    <Calendar className="w-3 h-3" /> Due {task.dueDate}
                  </span>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      <AddTaskModal />

    </MarketLayout>
  );
}
