import React, { useState } from 'react';
import './TaskItem.css';

const TaskItem = ({ task, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: task.title,
    description: task.description
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
    setEditData({
      title: task.title,
      description: task.description
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({
      title: task.title,
      description: task.description
    });
  };

  const handleSave = async () => {
    if (!editData.title.trim()) return;
    
    setIsLoading(true);
    try {
      await onUpdate(task.id, editData);
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleComplete = async () => {
    setIsLoading(true);
    try {
      await onUpdate(task.id, { ...task, completed: !task.completed });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      setIsLoading(true);
      try {
        await onDelete(task.id);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`task-item ${task.completed ? 'completed' : ''} ${isLoading ? 'loading' : ''}`}>
      <div className="task-content">
        {isEditing ? (
          <div className="edit-form">
            <input
              type="text"
              value={editData.title}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              className="edit-title"
              disabled={isLoading}
            />
            <textarea
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              className="edit-description"
              rows="3"
              disabled={isLoading}
            />
            <div className="edit-actions">
              <button onClick={handleSave} disabled={isLoading || !editData.title.trim()}>
                {isLoading ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={handleCancel} disabled={isLoading}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="task-info">
            <h3 className="task-title">{task.title}</h3>
            {task.description && (
              <p className="task-description">{task.description}</p>
            )}
            <div className="task-meta">
              <span className="task-date">Creado: {formatDate(task.created_at)}</span>
              {task.user && (
                <span className="task-user">Por: {task.user.username}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="task-actions">
          <button
            onClick={handleToggleComplete}
            className={`complete-btn ${task.completed ? 'completed' : ''}`}
            disabled={isLoading}
            title={task.completed ? 'Marcar como pendiente' : 'Marcar como completado'}
          >
            {task.completed ? '✓' : '○'}
          </button>
          <button
            onClick={handleEdit}
            className="edit-btn"
            disabled={isLoading}
            title="Editar tarea"
          >
            ✎
          </button>
          <button
            onClick={handleDelete}
            className="delete-btn"
            disabled={isLoading}
            title="Eliminar tarea"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskItem;
