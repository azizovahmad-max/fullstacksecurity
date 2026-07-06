import json

with open("custom_components/fullstacksecurity/manifest.json", "r") as f:
    manifest = json.load(f)
manifest["version"] = "1.0.8"
with open("custom_components/fullstacksecurity/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

with open("custom_components/fullstacksecurity/__init__.py", "r") as f:
    code = f.read()

code = code.replace("alarm_control_panel.full_stack_security", "alarm_control_panel.fullstack_security")

with open("custom_components/fullstacksecurity/__init__.py", "w") as f:
    f.write(code)
