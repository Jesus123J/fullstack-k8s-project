import React, { useState, useEffect } from 'react';
import './App.css';
import TaskList from './components/TaskList';
import TaskForm from './components/TaskForm';
import { apiService } from './services/api';
import LoginDni from './components/LoginDni';
import RegisterFace from './components/RegisterFace';
import FingerprintGate from './components/FingerprintGate';

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState('Checking...');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [biometricOk, setBiometricOk] = useState(
    localStorage.getItem('biometricOk') === 'true'
  );

  useEffect(() => {
    checkApiHealth();
    loadTasks();
  }, []);

  const checkApiHealth = async () => {
    try {
      const response = await apiService.healthCheck();
      setApiStatus(response.data.message);
    } catch (err) {
      setApiStatus('API no disponible');
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const response = await apiService.getTasks();
      setTasks(response.data.results || response.data);
    } catch (err) {
      setError('Error al cargar las tareas');
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskCreate = async (taskData) => {
    try {
      const response = await apiService.createTask(taskData);
      setTasks([response.data, ...tasks]);
    } catch (err) {
      setError('Error al crear la tarea');
      console.error('Error creating task:', err);
    }
  };

  const handleTaskUpdate = async (id, taskData) => {
    try {
      const response = await apiService.updateTask(id, taskData);
      setTasks(tasks.map(task => task.id === id ? response.data : task));
    } catch (err) {
      setError('Error al actualizar la tarea');
      console.error('Error updating task:', err);
    }
  };

  const handleTaskDelete = async (id) => {
    try {
      await apiService.deleteTask(id);
      setTasks(tasks.filter(task => task.id !== id));
    } catch (err) {
      setError('Error al eliminar la tarea');
      console.error('Error deleting task:', err);
    }
  };

  if (loading) {
    return (
      <div className="App">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Fullstack K8s Application</h1>
        <p className="api-status">Estado del API: {apiStatus}</p>
      </header>

      <main className="App-main">
        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        {!token ? (
          <div className="container">
            <div className="task-form-section" style={{ maxWidth: 480, margin: '0 auto' }}>
              <h2>Ingresar con DNI</h2>
              <LoginDni onLoggedIn={({ token: t }) => { localStorage.setItem('token', t); setToken(t); }} />
            </div>
          </div>
        ) : !biometricOk ? (
          <div className="container">
            <div className="task-form-section" style={{ maxWidth: 520, margin: '0 auto' }}>
              <h2>Verificación biométrica requerida</h2>
              <FingerprintGate
                onPassed={() => {
                  localStorage.setItem('biometricOk', 'true');
                  setBiometricOk(true);
                }}
                onFail={(msg) => setError(msg)}
              />
            </div>
          </div>
        ) : (
          <div className="container">
            <div className="task-form-section">
              <h2>Registro de Foto con Documento</h2>
              <RegisterFace />
            </div>

            <div className="task-list-section">
              <h2>Lista de Tareas ({tasks.length})</h2>
              <TaskList
                tasks={tasks}
                onUpdate={handleTaskUpdate}
                onDelete={handleTaskDelete}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
