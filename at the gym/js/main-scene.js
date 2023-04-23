import Player from "./player.js";
import createRotatingPlatform from "./create-rotating-platform.js";

var mytext, mytimer, gameOver;

export default class MainScene extends Phaser.Scene {
  preload() {
    this.load.tilemapTiledJSON("map", "assets/tilemaps/level.json");
    this.load.image(
      "kenney-tileset-64px-extruded",
      "assets/tilesets/kenney-tileset-64px-extruded.png"
    );

    this.load.image("wooden-plank", "assets/images/wooden-plank.png");
    this.load.image("block", "assets/images/block.png");

    this.load.spritesheet(
      "player",
      "assets/spritesheets/BaseFace6.png",
      {
        frameWidth: 32,
        frameHeight: 32,
        margin: 0,
        spacing: 0,
      }
    );

    this.load.atlas("emoji", "assets/atlases/emoji.png", "assets/atlases/emoji.json");

    this.load.audio("music","assets/sounds/music.m4a");
    this.load.audio("jump","assets/sounds/jump.mp3");
    this.load.audio("ouch","assets/sounds/ouch.mp3");
    this.load.audio("outro","assets/sounds/outro.mp3");

    //get window size
    this.gameWidth = this.sys.game.canvas.width;
    this.gameHeight = this.sys.game.canvas.height;
  }

  create() {
    gameOver = false;

    // window size rescale
    this.scale.displaySize.setAspectRatio( this.gameWidth/this.gameHeight );
    this.scale.refresh();

    // countdown timer
    mytimer = this.time.addEvent({
      delay: 60000,
      paused: false
    });

    const map = this.make.tilemap({ key: "map" });
    const tileset = map.addTilesetImage("kenney-tileset-64px-extruded");
    const groundLayer = map.createLayer("Ground", tileset, 0, 0);
    const lavaLayer = map.createLayer("Lava", tileset, 0, 0);
    map.createLayer("Background", tileset, 0, 0);
    map.createLayer("Foreground", tileset, 0, 0).setDepth(10);

    // Set colliding tiles before converting the layer to Matter bodies
    groundLayer.setCollisionByProperty({ collides: true });
    lavaLayer.setCollisionByProperty({ collides: true });

    // Get the layers registered with Matter. Any colliding tiles will be given a Matter body. We
    // haven't mapped our collision shapes in Tiled so each colliding tile will get a default
    // rectangle body (similar to AP).
    this.matter.world.convertTilemapLayer(groundLayer);
    this.matter.world.convertTilemapLayer(lavaLayer);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.matter.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // The spawn point is set using a point object inside of Tiled (within the "Spawn" object layer)
    const { x, y } = map.findObject("Spawn", (obj) => obj.name === "Spawn Point");
    this.player = new Player(this, x, y);

    // Smoothly follow the player
    this.cameras.main.startFollow(this.player.sprite, false, 0.5, 0.5);

    this.unsubscribePlayerCollide = this.matterCollision.addOnCollideStart({
      objectA: this.player.sprite,
      callback: this.onPlayerCollide,
      context: this,
    });

    // Load up some crates from the "Crates" object layer created in Tiled
    map.getObjectLayer("Crates").objects.forEach((crateObject) => {
      const { x, y, width, height } = crateObject;

      // Tiled origin for coordinate system is (0, 1), but we want (0.5, 0.5)
      this.matter.add
        .image(x + width / 2, y - height / 2, "block")
        .setBody({ shape: "rectangle", density: 0.001 });
    });

    // Create platforms at the point locations in the "Platform Locations" layer created in Tiled
    map.getObjectLayer("Platform Locations").objects.forEach((point) => {
      createRotatingPlatform(this, point.x, point.y);
    });

    // Create celebration sensor at rectangle object created in Tiled (under the "Sensors" layer)
    const rect = map.findObject("Sensors", (obj) => obj.name === "Celebration");
    const celebrateSensor = this.matter.add.rectangle(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width,
      rect.height,
      {
        isSensor: true, // It shouldn't physically interact with other bodies
        isStatic: true, // It shouldn't move
      }
    );
    this.unsubscribeCelebrate = this.matterCollision.addOnCollideStart({
      objectA: this.player.sprite,
      objectB: celebrateSensor,
      callback: this.onPlayerCelebrate,
      context: this,
    });

    // Create exit sensor at rectangle object created in Tiled (under the "Sensors" layer)
    const rect2 = map.findObject("Sensors", (obj) => obj.name === "Exit");
    const exitSensor = this.matter.add.rectangle(
      rect2.x + rect2.width / 2,
      rect2.y + rect2.height / 2,
      rect2.width,
      rect2.height,
      {
        isSensor: true, // It shouldn't physically interact with other bodies
        isStatic: true, // It shouldn't move
      }
    );
    this.unsubscribeExit = this.matterCollision.addOnCollideStart({
      objectA: this.player.sprite,
      objectB: exitSensor,
      callback: this.onPlayerExit,
      context: this,
    });

    // help text
    mytext = this.add.text(16, 16, 'Countdown: ', {
      fontSize: "18px",
      padding: { x: 10, y: 5 },
      backgroundColor: "#ffffff",
      fill: "#000000",
    });
    mytext.setScrollFactor(0).setDepth(1000);

    //play music
    this.sound.stopAll();
    this.sound.play("music");
  }

  update(){
    var t = mytimer.getRemainingSeconds().toFixed(1);
    if (!gameOver){
      if (t>0){
        mytext.setText(t);
      } else {
          gameOver=true;
          mytext.setText("Time is up!");
          this.player.freeze();
          const cam = this.cameras.main;
          cam.fade(2000, 0, 0, 0);
          cam.once("camerafadeoutcomplete", () => this.scene.restart());
      }
    }
  }

  onPlayerCollide({ gameObjectB }) {
    if (!gameObjectB || !(gameObjectB instanceof Phaser.Tilemaps.Tile)) return;

    const tile = gameObjectB;

    // Check the tile property set in Tiled (you could also just check the index if you aren't using
    // Tiled in your game)
    if (tile.properties.isLethal) {
      // Unsubscribe from collision events so that this logic is run only once
      this.unsubscribePlayerCollide();
      gameOver=true;
      this.player.freeze();
      this.sound.play("ouch");
      const cam = this.cameras.main;
      cam.fade(2000, 0, 0, 0);
      cam.once("camerafadeoutcomplete", () => this.scene.restart());
    }
  }

  onPlayerCelebrate() {
    // Celebrate only once
    this.unsubscribeCelebrate();

    // Drop some heart-eye emojis, of course
    for (let i = 0; i < 35; i++) {
      const x = this.player.sprite.x + Phaser.Math.RND.integerInRange(-50, 50);
      const y = this.player.sprite.y - 750 + Phaser.Math.RND.integerInRange(-10, 10);
      this.matter.add
        .image(x, y, "emoji", "1f4a9", {
          restitution: 1,
          friction: 0,
          density: 0.0001,
          shape: "circle",
        })
        .setScale(0.5);
    }
  }

  onPlayerExit() {
    // Celebrate only once
    this.unsubscribeExit();
    gameOver=true;
    this.sound.play("outro");
    this.player.freeze();
    const cam = this.cameras.main;
    cam.fade(4000, 0, 0, 0);
    cam.once("camerafadeoutcomplete", () => this.scene.restart());
  }

}
