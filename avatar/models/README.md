# Models

`buddy.glb` is the default avatar (body "female"): a Mixamo-style rigged character with
the clips `SambaDance` and `TPose`. It is animated by `js/avatars/RiggedAvatar.js` (all
reactions, dances and emotes are retargeted onto its skeleton). A copy lives in
`../../dist/buddy.glb` for the drop-in `avatar-buddy.js`.

Other models:

```
../index.html?model=models/your-avatar.glb        # everyone uses this model
../index.html?maleModel=models/buddy-male.glb     # 3D model for body "male"
```

Optional clip mapping for non-Mixamo models whose animation names differ:

```
?model=models/your-avatar.glb&clips={"greet":"Wave_01","celebrate":"Victory","idle":"Breathing"}
```

See the main README (sections 7 and 7a). If a model fails to load, the built-in character is used.
