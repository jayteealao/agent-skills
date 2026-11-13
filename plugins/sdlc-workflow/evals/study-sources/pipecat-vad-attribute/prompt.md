---
description: "A pipecat pipeline crashes at runtime on a guessed API."
tags: [study-sources, should-trigger]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Our voice bot crashes on start with pipecat-ai 0.0.90:

```
AttributeError: 'SileroVADAnalyzer' object has no attribute 'link'
  File ".venv/lib/python3.12/site-packages/pipecat/pipeline/pipeline.py", line 41, in _link_processors
```

The pipeline is built like this:

```python
vad = SileroVADAnalyzer()
pipeline = Pipeline([transport.input(), vad, stt, llm, tts, transport.output()])
```

Where is the VAD analyzer supposed to go? Fix the pipeline.
