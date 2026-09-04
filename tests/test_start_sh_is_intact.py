"""start.sh embeds Python inside a double-quoted shell string. Guard it.

On 2026-09-04 a comment containing a double quote closed that shell string
early, silently destroying every schema patch below it — including the ALTER
that adds sap_work_orders.system_status. The app then booted with a model
referencing a column that did not exist, and the job pool 500'd in production.

`bash -n start.sh` passed, because the result was still valid BASH. Only
compiling the extracted Python catches it.
"""

import os
import re

START_SH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'start.sh')


def _python_blocks():
    """Every `python -c "..."` payload, exactly as the shell would hand it over."""
    src = open(START_SH).read()
    return re.findall(r'python -c "((?:[^"\\]|\\.)*)"', src, re.S)


def test_every_embedded_python_block_compiles():
    blocks = _python_blocks()
    assert blocks, 'start.sh should contain embedded python; the regex may have rotted'
    for i, block in enumerate(blocks, 1):
        body = block.replace('\\"', '"').replace('\\$', '$').replace('\\\\', '\\')
        compile(body, f'<start.sh block {i}>', 'exec')


def test_the_schema_patches_survive_to_the_end_of_the_block():
    """A stray quote truncates the block — the LAST patch is what goes missing.

    Asserting on a statement near the end proves the whole block survived,
    which counting statements would not.
    """
    blocks = _python_blocks()
    joined = '\n'.join(blocks)
    assert 'ALTER TABLE sap_work_orders ADD COLUMN' in joined, (
        'the sap_work_orders columns must still be inside an embedded python block')
    assert 'system_status' in joined and 'app_work_state' in joined
