# Third-party notices: moderator

The `moderator` model derives from components licensed by third parties. Their licenses apply to the components named below; nothing in the Desert Ant Labs Source-Available License overrides them.

## Vision backbone

### MobileNetV4-Conv-Medium (Google)
- **Source:** [`timm/mobilenetv4_conv_medium.e250_r384_in12k_ft_in1k`](https://huggingface.co/timm/mobilenetv4_conv_medium.e250_r384_in12k_ft_in1k) on Hugging Face, distributed via the [`timm`](https://github.com/huggingface/pytorch-image-models) library.
- **Paper:** [Qin et al., "MobileNetV4: Universal Models for the Mobile Ecosystem"](https://arxiv.org/abs/2404.10518), Google Research, 2024.
- **License:** Apache License 2.0 (both code and weights).
- **Use in `moderator`:** Fine-tuned. The distributed weights are modified from the upstream checkpoint.
- **Attribution & modifications:** Apache 2.0 requires that derivative distributions preserve the copyright notice and indicate modifications. The weights are trained against our labels and compressed for on-device use.

## Library dependencies (training and inference)

- **`timm`** (Hugging Face): Apache License 2.0. Backbone instantiation and pretrained weight loading.
- **PyTorch:** [BSD 3-Clause](https://github.com/pytorch/pytorch/blob/main/LICENSE). Training and export.
- **ONNX & ONNX Runtime** (Microsoft, Linux Foundation): Apache License 2.0. Evaluation.
- **Core ML Tools** (Apple): [BSD 3-Clause](https://github.com/apple/coremltools/blob/main/LICENSE.txt). Core ML conversion.
- **LiteRT Torch and AI Edge Quantizer** (Google): Apache License 2.0. LiteRT conversion.
- **MediaPipe Pose** (Google): Apache License 2.0. Used at training time only; not shipped in the model artifact.

## Training-data sources (informational)

Training data does not ship with the model; the artifact contains only weights. The following datasets and corpora contributed to training under their respective licenses, listed for transparency:

- **Wikimedia Commons:** CC0, CC BY, and CC BY-SA categories under Commons content licensing. Used for nude, art-historical, and swimwear photographs.
- **Met Museum Open Access** (CC0): art-historical body imagery.
- **Smithsonian Open Access** (CC0): art-historical body imagery.
- **National Gallery of Art OpenData** (CC0): art-historical body imagery.
- **Open Images V7 / Open Images Extended** (CC BY 4.0; Google): random web photos as hard negatives.
- **Pony Realism v23 Ultra** (`John6666/pony-realism-v23-ultra-sdxl`): an SDXL-family checkpoint distributed under the Fair AI Public License. Used at training time to generate per-class synthetic boundary and positive examples. The classifier is an independent work product. Outputs of the generator are not redistributed.

## License-notice retention

The Apache 2.0 and BSD 3-Clause licenses on the upstream components require preservation of copyright notices.

- **MobileNetV4** is Apache 2.0. The `timm` repository's [LICENSE](https://github.com/huggingface/pytorch-image-models/blob/main/LICENSE) attributes copyright to Ross Wightman and contributors; the MobileNetV4 architecture is by Google Research.
- **PyTorch** is BSD 3-Clause. Its [LICENSE](https://github.com/pytorch/pytorch/blob/main/LICENSE) attributes copyright to Meta and contributors.
- **Core ML Tools** is BSD 3-Clause. Its [LICENSE](https://github.com/apple/coremltools/blob/main/LICENSE.txt) attributes copyright to Apple Inc.
- **MediaPipe** distributions do not ship a separate NOTICE file beyond the LICENSE.
