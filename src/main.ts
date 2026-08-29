/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */


/*
---- step 1: create random number generator for the target. Done
step 2: animate the target falling down the screen.
step 2a: figure out the logic for creating random target values and having multiple targets on the screen at once.
step 2b: attributing each target to an animated object
step 3: use keyevents to determine behaviour of the digit toggles
step 4: make the target disappear when the correct number is entered
---- step 5: create random number generator for time between target drops. Done
step 6: figure out how to lower time between target drops as the game progresses

*/

import "./style.css";

import {
    Observable,
    catchError,
    filter,
    fromEvent,
    interval,
    map,
    scan,
    switchMap,
    take,
    timer,
    expand,
    merge,
    mergeMap,
    startWith,
} from "rxjs";

/** Constants */

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

// The falling target for the game
const Target = {
    WIDTH: 64,
    HEIGHT: 36,
} as const;

// Game constants
const Constants = {
    DIGIT_COUNT: 8,
    TICK_RATE_MS: 50, // Might need to change this!
} as const;

// State processing
type State = Readonly<{
    gameEnd: boolean;
    targets: ReadonlyArray<FallingTarget>;
    digits: ReadonlyArray<number>;
    playerValue: number;
    score: number
}>;

type FallingTarget = Readonly<{
    id: number;
    value: number;
    x: number;
    y: number;
}>;

// game starts in non-ending state
const initialState: State = {
    gameEnd: false,
    targets: [], // Initialize with a default value
    digits: Array(Constants.DIGIT_COUNT).fill(0),
    playerValue: 0,
    score: 0
};

/**
 * Copied the random RNG function from applied 4.
 * A random number generator which provides two pure functions
 * `hash` and `scale`. Call `hash` repeatedly to generate the
 * sequence of hashes.
 */
abstract class RNG {
    private static m = 0x80000000; // 2^31
    private static a = 1103515245;
    private static c = 12345;

    public static hash = (seed: number): number =>
        (RNG.a * seed + RNG.c) % RNG.m;

    public static scale = (hash: number): number =>
        (2 * hash) / (RNG.m - 1) - 1; // in [-1, 1]
}

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State) =>{

    // used to shift targets down by a certain amount per tick
    const moveTargets = s.targets.map(target =>(
        {
            ...target,
            y: target.y+1
        }));
    
    // used to determine if a target has reached the end
    const gameEnd = moveTargets.some(
        target =>
            target.y >= Viewport.CANVAS_HEIGHT -90
    );

    return{
        ...s,
        targets: moveTargets,
        gameEnd
    }
};



// Rendering (side effects)

/**
 * Brings an SVG element to the foreground.
 * @param elem SVG element to bring to the foreground
 */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "visible");
    bringToForeground(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "hidden");
};

/**
 * Creates a random number generator for time between target drops.
 * 
 */
const randomDropInterval = ():number =>
    // maps interval to a random number between 1000 and 3000
        Math.floor(Math.random() * 1000)+2000;


/**
 * Creates a random number generator which generates a base 16 number for the target.
 * 
 */
const randomTarget$ = timer(randomDropInterval()) //use timer instead of interval, allows different wait time between each new target.
    .pipe(
        expand(() => timer(randomDropInterval())), // continues to call timer
        // maps interval to a random number between 0 and 255
        map(() => Math.floor(Math.random() * 256)),
        // updates the state with the new target value
        map((value)=>(s:State):State => ({ 
            ...s,// only want to map the targets attribute of State
            targets:[...s.targets, // add a new target to the existing list of targets
                createTarget(value,s.targets.length)
            ]
        }
    )),
    );

/**
 * We dont want our target to always be in the middle of our game
 * Create random generator for x value of target
*/
const randomTargetx = (): number =>
        Math.random() * (Viewport.CANVAS_WIDTH - Target.WIDTH);


/** 
 * Generate a target
 * 
*/
const createTarget = (
    value: number,
    id:number,
): FallingTarget => ({
    id,
    value,
    x: randomTargetx(),
    y:0
});


/**Create a function to allow the binary digits at the bottom to be changed.
 */
function keyFlip(){
    // create an observable for keyboard events
    const keyPress$ = fromEvent<KeyboardEvent>(document, "keydown")
    .pipe(
        //Filters so that only certain key presses are accepted
        filter(event =>
            ["Digit1", "Digit2", "Digit3", "Digit4",
            "Digit5", "Digit6", "Digit7", "Digit8"]
                .includes(event.code)// different to event.key instead of representing value of key, it represents position of the key.
        ),
        
        map(event => Number(event.code.replace("Digit", "")) - 1), //converts key name to a number from 0-7, represents index

        map(index => (s: State): State => {
            const newDigits = s.digits.map((digit, i) => // runs through array
                i === index ? 1 - digit : digit, // if the index i is the same as our required index, flip digit
            );

            const newState: State = {
                ...s,
                digits: newDigits,
            };
            return checkTarget(newState);
        }),
    );
    return keyPress$
};

function clickFlip(){
    const clickDown$ = fromEvent<MouseEvent>(document, "mousedown")
    .pipe(
        filter(event => {
            const target = event.target as Element;

            return target.id.startsWith("bit-");
        }),
        map(event => {
            const target = event.target as Element;
            return Number(target.id.replace("bit-", ""))
        }),
        map(index => (s: State): State => {
            const newDigits = s.digits.map((digit, i) =>
                i === index ? 1 - digit : digit,
            );

            const newState: State = {
                ...s,
                digits: newDigits,
            };
            return checkTarget(newState);
        }),
    )

    return  clickDown$
};

/*
coverts the binary digit array into an integer value
*/
const digToVal = (digits:ReadonlyArray<number>,):number =>
    digits.reduce((value, digit) => value*2 + digit, 0);



/*
Create a constant to check the values of the targets and compare to our summed binary
*/
const checkTarget = (s:State):State =>{
    // obtain the player binary value
    const playerValue = digToVal(s.digits);


    if (s.targets.length === 0){
        return s
    }

    // since only the lowest target can be destroyed, we only want the value of said target
    const lowTarget = s.targets.reduce((lowest,target) =>
        target.y> lowest.y? target:lowest);

    if (playerValue === lowTarget.value){
        // remove the target otherwise
        return {...s,
        playerValue,
        score: s.score+0.25,
        targets:s.targets.filter(target => target.id !== lowTarget.id),
        };
    }else{
        // else do nothing
        return{
            ...s,
            playerValue,
        }
    }
    


}

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

const render = (): ((s: State) => void) => {
    const svg = document.querySelector(
        "#svgCanvas") as SVGSVGElement;

    const scoreText = document.querySelector(
        "#scoreText") as HTMLElement;

    const playerValText = document.querySelector(
        "#playerValText") as HTMLElement;

    const gameOver = document.querySelector(
        "#gameOver") as SVGElement;

    svg.setAttribute(
        "viewBox",
        `0 0 ${Viewport.CANVAS_WIDTH} ${Viewport.CANVAS_HEIGHT}`,
    );

    return (s: State) => {
        // show the gameover screen when you lose the game
        if (s.gameEnd) {
            show(gameOver);
        } else {
            hide(gameOver);
        }

        scoreText.textContent = `${s.score}`;
        playerValText.textContent = `${(s.playerValue.toString(16).toUpperCase())}`;

        // IDs of targets still in State
        const targetIDs = s.targets.map(
            target => target.id
        );

        // Remove SVG targets that no longer exist in State
        svg.querySelectorAll('[id^="target-"]')
            .forEach(element => {
                const id = Number(
                    element.id
                        .replace("target-text-", "")
                        .replace("target-", ""),
                );

                if (!targetIDs.includes(id)) {
                    element.remove();
                }
            });

        //sort targets by their y-values before we render them
        // this means the lower down targets are rendered infront.
        [...s.targets]
            .sort((a, b) => a.y - b.y)
            .forEach(targetState => {
            const existingTarget =
                document.querySelector(
                    `#target-${targetState.id}`,
                );

            const existingText =
                document.querySelector(
                    `#target-text-${targetState.id}`,
                );

            if (existingTarget && existingText) {
                // Move existing target
                existingTarget.setAttribute(
                    "y",
                    `${targetState.y}`,
                );

                existingText.setAttribute(
                    "y",
                    `${targetState.y + Target.HEIGHT / 2 + 8}`,
                );
            } else {
                // Create new target
                const target = createSvgElement(
                    svg.namespaceURI,
                    "rect",
                    {
                        id: `target-${targetState.id}`,
                        x: `${targetState.x}`,
                        y: `${targetState.y}`,
                        width: `${Target.WIDTH}`,
                        height: `${Target.HEIGHT}`,
                        rx: "6",
                        fill: "white",
                        stroke: "black",
                        "stroke-width": "2",
                    },
                );

                const targetText = createSvgElement(
                    svg.namespaceURI,
                    "text",
                    {
                        id: `target-text-${targetState.id}`,
                        x: `${
                            targetState.x +
                            Target.WIDTH / 2
                        }`,
                        y: `${
                            targetState.y +
                            Target.HEIGHT / 2 +
                            8
                        }`,
                        "text-anchor": "middle",
                        "font-family": "monospace",
                        fill: "black",
                    },
                );

                targetText.textContent =
                    targetState.value
                        .toString(16)
                        .toUpperCase();

                svg.appendChild(target);
                svg.appendChild(targetText);
            }
        });

        // Create/update digit row
        const digitWidth =
            Viewport.CANVAS_WIDTH /
            Constants.DIGIT_COUNT;

        Array.from({
            length: Constants.DIGIT_COUNT,
        }).forEach((_, i) => {
            const existingBit =
                document.querySelector(
                    `#bit-${i}`,
                );

            const existingBitText =
                document.querySelector(
                    `#bit-text-${i}`,
                );

            if (existingBit && existingBitText) {
                existingBitText.textContent =
                    `${s.digits[i]}`;
            } else {
                const bit = createSvgElement(
                    svg.namespaceURI,
                    "rect",
                    {
                        id: `bit-${i}`,
                        x: `${i * digitWidth + 4}`,
                        y: `${
                            Viewport.CANVAS_HEIGHT - 50
                        }`,
                        width: `${digitWidth - 8}`,
                        height: "40",
                        fill: "#ef9a9a",
                        stroke: "black",
                        "stroke-width": "2",
                    },
                );

                const bitText = createSvgElement(
                    svg.namespaceURI,
                    "text",
                    {
                        id: `bit-text-${i}`,
                        x: `${
                            i * digitWidth +
                            digitWidth / 2
                        }`,
                        y: `${
                            Viewport.CANVAS_HEIGHT - 22
                        }`,
                        "text-anchor": "middle",
                        "font-family": "monospace",
                        fill: "black",
                        "pointer-events": "none",
                    },
                );

                bitText.textContent =
                    `${s.digits[i]}`;

                svg.appendChild(bit);
                svg.appendChild(bitText);
            }
        });
    };
};

export const state$ = (): Observable<State> => {

    const restart$ = fromEvent<KeyboardEvent>(
        document,
        "keydown",
    ).pipe(filter(
        event => event.code === "KeyR"
    ),
    startWith(null)
    );


    return restart$.pipe(
        switchMap(() =>{
            /** Determines the rate of time steps */
            // replaces what interval outputs with tick function
            const tick$ = interval(Constants.TICK_RATE_MS).pipe(map(()=>tick));

            //make a keypress observable
            const keyPress$ = keyFlip();
            const mouseClick$ = clickFlip();


        return merge(tick$,randomTarget$,keyPress$,mouseClick$)
        .pipe(scan((state, stateUpdate) => 
            stateUpdate(state),
            initialState,
        ),
    );
}),
);
};

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    click$.pipe(switchMap(() => state$())).subscribe(render());
}
