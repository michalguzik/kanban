from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import uuid
from datetime import datetime
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(BASE_DIR, 'kanban.db')}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


# ── Models ──
class Project(db.Model):
    id       = db.Column(db.String(36), primary_key=True, default=lambda: "p" + str(uuid.uuid4())[:8])
    name     = db.Column(db.String(120), nullable=False)
    color    = db.Column(db.String(20), default="#a29bfe")
    tasks    = db.relationship("Task", backref="project", cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "color": self.color}

class Task(db.Model):
    id         = db.Column(db.String(36), primary_key=True, default=lambda: "t" + str(uuid.uuid4())[:8])
    project_id = db.Column(db.String(36), db.ForeignKey("project.id"), nullable=False)
    title      = db.Column(db.String(200), nullable=False)
    description= db.Column(db.Text, default="")
    status     = db.Column(db.String(20), default="todo")
    priority   = db.Column(db.String(10), default="medium")
    created    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "created": self.created.isoformat()
        }

def seed():
    if Project.query.count() == 0:
        projects = [
            Project(id="p1", name="Website Redesign", color="#ff6b6b"),
            Project(id="p2", name="Mobile App",        color="#4ecdc4"),
            Project(id="p3", name="Marketing Campaign",color="#ffe66d"),
        ]
        db.session.add_all(projects)
        db.session.flush()
        tasks = [
            Task(project_id="p1", title="Wireframe homepage",   description="Create lo-fi wireframes",        status="todo",        priority="high"),
            Task(project_id="p1", title="Design system setup",  description="Define colors, fonts, components",status="in_progress", priority="high"),
            Task(project_id="p2", title="Auth flow",            description="Login and registration screens",  status="todo",        priority="medium"),
            Task(project_id="p2", title="API integration",      description="Connect backend endpoints",       status="done",        priority="low"),
            Task(project_id="p3", title="Social media assets",  description="Banners for all platforms",       status="in_progress", priority="medium"),
        ]
        db.session.add_all(tasks)
        db.session.commit()

# ── Error handlers ──
@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": "Bad request", "detail": str(e)}), 400

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found", "detail": str(e)}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Server error", "detail": str(e)}), 500

# ── Routes ──
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data")
def get_data():
    projects = [p.to_dict() for p in Project.query.all()]
    tasks    = [t.to_dict() for t in Task.query.all()]
    return jsonify({"projects": projects, "tasks": tasks})

@app.route("/api/projects", methods=["POST"])
def add_project():
    body = request.get_json(force=True)
    p = Project(name=body["name"], color=body.get("color", "#a29bfe"))
    db.session.add(p)
    db.session.commit()
    return jsonify(p.to_dict()), 201

@app.route("/api/projects/<pid>", methods=["DELETE"])
def delete_project(pid):
    p = Project.query.get_or_404(pid)
    db.session.delete(p)
    db.session.commit()
    return jsonify({"ok": True})

@app.route("/api/tasks", methods=["POST"])
def add_task():
    body = request.get_json(force=True)
    t = Task(
        project_id  = body["project_id"],
        title       = body["title"],
        description = body.get("description", ""),
        status      = body.get("status", "todo"),
        priority    = body.get("priority", "medium"),
    )
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201

@app.route("/api/tasks/<tid>", methods=["PATCH"])
def update_task(tid):
    t    = Task.query.get_or_404(tid)
    body = request.get_json(force=True)
    for field in ("title", "description", "status", "priority", "project_id"):
        if field in body:
            setattr(t, field, body[field])
    db.session.commit()
    return jsonify(t.to_dict())

@app.route("/api/tasks/<tid>", methods=["DELETE"])
def delete_task(tid):
    t = Task.query.get_or_404(tid)
    db.session.delete(t)
    db.session.commit()
    return jsonify({"ok": True})

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed()
    app.run(debug=True)