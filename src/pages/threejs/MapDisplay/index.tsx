/**
 * 地图展示
 */
import React, { useRef, useLayoutEffect, useCallback } from "react";
import { useIntl } from "react-intl";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { geoMercator } from "d3-geo";
import { useGlobalContext } from "hooks/useGlobalContext";
import useInitialize from "hooks/threejs/useInitialize";
import styles from "./index.module.scss";

const cameraInitPosition = { x: 0, y: -20, z: 80 }; // 相机初始位置
const mapDepth = 6; // 地图板块深度
const mapColor = "#008170"; // 地图表面颜色
const mapSideColor = "#1AACAC"; // 地图侧面颜色
const mapHoverColor = "#005B41"; // hover后的地图表面颜色

const MapDisplay = () => {
  const intl = useIntl();
  const { menuWidth, headHeight } = useGlobalContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mapRef = useRef<THREE.Object3D | null>(null);
  const raycaster = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouse = useRef<THREE.Vector2 | null>(null);
  const lastPick = useRef<any>(null);

  // 创建地图对象并添加到场景中
  const createMap = (data: Record<string, any>, scene: THREE.Scene) => {
    // 初始化一个地图对象
    const map = new THREE.Object3D();
    // 墨卡托投影转换
    const projection = geoMercator()
      .center([104.0, 37.5])
      .scale(80)
      .translate([0, 0]);

    data.features.forEach(
      (elem: {
        type: string;
        properties: Record<string, any>;
        geometry: { type: string; coordinates: any[] };
      }) => {
        // 创建一个省份3D对象
        const province = new THREE.Object3D();
        // 每个的 坐标 数组
        const { coordinates } = elem.geometry;
        // 循环坐标数组
        coordinates.forEach((multiPolygon: any[]) => {
          multiPolygon.forEach((polygon) => {
            const shape = new THREE.Shape();

            // 给每个省的边界画线
            const lineGeometry = new THREE.BufferGeometry();
            const pointsArray = [];
            for (let i = 0; i < polygon.length; i++) {
              const [x, y] = projection(polygon[i]);
              if (i === 0) {
                shape.moveTo(x, -y);
              } else {
                shape.lineTo(x, -y);
              }
              pointsArray.push(new THREE.Vector3(x, -y, mapDepth));
            }
            lineGeometry.setFromPoints(pointsArray);

            const extrudeSettings = {
              depth: mapDepth,
              bevelEnabled: false,
              bevelThickness: 1,
              bevelSize: 1,
              bevelOffset: 0,
              bevelSegments: 1,
            };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const material1 = new THREE.MeshBasicMaterial({
              color: mapColor,
              transparent: true,
              opacity: 1,
            });
            const material2 = new THREE.MeshBasicMaterial({
              color: mapSideColor,
              transparent: true,
              opacity: 1,
            });

            const mesh = new THREE.Mesh(geometry, [material1, material2]);
            const lineMaterial = new THREE.LineBasicMaterial({
              color: "white",
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            // 将省份的属性 加进来
            // @ts-ignore
            province.properties = elem.properties;
            province.add(mesh);
            province.add(line);
          });
        });
        map.add(province);
      }
    );
    map.position.set(0, 20, 0);

    scene.add(map);
    mapRef.current = map;
  };

  // 加载地图数据
  const loadMapData = (scene: THREE.Scene) => {
    const loader = new THREE.FileLoader();
    loader.load("./public/json/ChinaMap.json", (data: string | ArrayBuffer) => {
      const jsondata = JSON.parse(data as string);
      createMap(jsondata, scene);
    });
  };

  const onMouseMove = useCallback(
    (e: any) => {
      if (tooltipRef.current) {
        if (!mouse.current) {
          mouse.current = new THREE.Vector2();
        }
        const { clientX, clientY } = e;
        if (new THREE.Vector2())
          mouse.current.x =
            ((clientX - menuWidth) / (window.innerWidth - menuWidth)) * 2 - 1;
        mouse.current.y =
          -((clientY - headHeight) / (window.innerHeight - headHeight)) * 2 + 1;

        tooltipRef.current.style.left = `${clientX - menuWidth + 4}px`;
        tooltipRef.current.style.top = `${clientY - headHeight + 4}px`;
      }
    },
    [menuWidth, headHeight]
  );

  const initializeHandle = (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer
  ) => {
    if (containerRef.current) {
      scene.background = new THREE.Color("#111111");
      camera.position.set(
        cameraInitPosition.x,
        cameraInitPosition.y,
        cameraInitPosition.z
      );
      renderer.setClearColor("#111111");
      renderer.shadowMap.enabled = true;

      const controls = new OrbitControls(camera, renderer.domElement);
      controlsRef.current = controls;

      loadMapData(scene);
    }
  };

  const showTip = () => {
    if (tooltipRef.current) {
      // 显示省份的信息
      if (lastPick.current) {
        const { properties } = lastPick.current.object.parent;
        tooltipRef.current.textContent = properties.name;
        tooltipRef.current.style.visibility = "visible";
      } else {
        tooltipRef.current.style.visibility = "hidden";
      }
    }
  };

  const renderHandle = (
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) => {
    if (mapRef.current && mouse.current) {
      // 恢复上一次清空的
      if (lastPick.current) {
        lastPick.current.object.material[0].color.set(mapColor);
        lastPick.current.object.material[1].color.set(mapSideColor);
        if (tooltipRef.current) {
          tooltipRef.current.style.visibility = "hidden";
        }
      }
      lastPick.current = null;
      // 通过摄像机和鼠标位置更新射线
      raycaster.current.setFromCamera(mouse.current as THREE.Vector2, camera);
      // 算出射线 与当场景相交的对象有那些
      const intersects = raycaster.current.intersectObjects(
        scene.children,
        true
      );
      lastPick.current = intersects.find(
        (item: any) => item.object.material && item.object.material.length === 2
      );
      if (
        lastPick.current &&
        lastPick.current.object?.parent?.properties?.name
      ) {
        lastPick.current.object.material[0].color.set(mapHoverColor);
        lastPick.current.object.material[1].color.set(mapHoverColor);
        showTip();
      }
    }
    if (controlsRef.current) {
      controlsRef.current?.update();
    }
  };

  const { resize } = useInitialize(
    containerRef,
    initializeHandle,
    null,
    renderHandle
  );

  useLayoutEffect(() => {
    resize();
  }, [menuWidth]);

  return (
    <div
      className={styles.container}
      onMouseMove={onMouseMove}
      ref={containerRef}
    >
      <div className={styles.tooltip} ref={tooltipRef}></div>
    </div>
  );
};

export default MapDisplay;