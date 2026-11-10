# Models

Drop `.glb` / `.gltf` files here and load them with:

```
../index.html?model=models/your-avatar.glb
```

Optional clip mapping when your animation names differ:

```
?model=models/your-avatar.glb&clips={"greet":"Wave_01","celebrate":"Victory","idle":"Breathing"}
```

See the main README ("Using your own GLB/GLTF model") for the name-matching rules.
If no model is given, or it fails to load, the built-in placeholder character is used.
